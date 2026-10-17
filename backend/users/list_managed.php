<?php
// Included only by the authenticated get_users endpoint for managed requests.
require_once __DIR__ . '/../config/cors.php';
require_once __DIR__ . '/management.php';
require_login(['admin']);
$conn = null;
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') um_fail(405, 'Method not allowed.');
    $search = um_text($_GET['search'] ?? '', 150);
    $role = um_text($_GET['role'] ?? '', 30);
    $status = um_text($_GET['status'] ?? '', 20);
    $tab = um_text($_GET['tab'] ?? 'active', 20);
    $sort = um_text($_GET['sort'] ?? 'created_at', 30);
    $direction = um_text($_GET['direction'] ?? 'desc', 4);
    $sorts = ['full_name' => 'u.full_name', 'created_at' => 'u.created_at', 'last_login' => 'lh.last_login'];
    if (!isset($sorts[$sort]) || !in_array($direction, ['asc', 'desc'], true)
        || !in_array($role, ['', 'admin', 'resident', 'relief_personnel'], true)
        || !in_array($status, ['', 'active', 'inactive', 'pending', 'rejected'], true)
        || !in_array($tab, ['active', 'inactive', 'all', 'requests', 'rejected'], true)) um_fail(400, 'Choose valid account filters.');
    $page = um_id($_GET['page'] ?? 1);
    $perPage = um_id($_GET['per_page'] ?? 20);
    if (!in_array($perPage, [10, 20, 50], true)) um_fail(400, 'Choose 10, 20 or 50 accounts per page.');
    $where = ['1=1']; $params = [];
    $conn = (new Database())->connect();
    $approval = registration_expression($conn);
    if ($role !== '') { $where[] = 'u.role = ?'; $params[] = $role; }
    foreach ([$tab === 'all' ? '' : ($tab === 'requests' ? 'pending' : $tab), $status] as $state) {
        if (in_array($state, ['pending', 'rejected'], true)) { $where[] = "$approval = ?"; $params[] = $state; }
        elseif ($state !== '') { $where[] = "($approval = 'approved' AND u.is_active = ?)"; $params[] = $state === 'active' ? 1 : 0; }
    }
    if ($search !== '') {
        $like = '%' . strtr($search, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
        $where[] = "(u.full_name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!' OR EXISTS
            (SELECT 1 FROM households hs WHERE hs.user_id = u.user_id AND (hs.purok LIKE ? ESCAPE '!' OR hs.address LIKE ? ESCAPE '!')))";
        array_push($params, $like, $like, $like, $like);
    }
    if (isset($_GET['ids'])) {
        $ids = explode(',', um_text($_GET['ids'], 600));
        if (count($ids) > 50) um_fail(400, 'Select at most 50 accounts.');
        $ids = array_map('um_id', $ids);
        $where[] = 'u.user_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        array_push($params, ...$ids);
    }
    $condition = implode(' AND ', $where);
    $conn->beginTransaction();
    $count = $conn->prepare("SELECT COUNT(*) FROM users u WHERE $condition");
    $count->execute($params);
    $total = intval($count->fetchColumn());
    $pages = max(1, (int)ceil($total / $perPage));
    $page = min($page, $pages);
    $offset = ($page - 1) * $perPage;
    $query = "SELECT u.user_id, u.full_name, u.email, u.role, u.is_active, u.contact_number, u.created_at,
        lh.last_login, h.location, $approval registration_status FROM users u
        LEFT JOIN (SELECT user_id, MAX(login_at) last_login FROM login_history WHERE login_status = 'Success' GROUP BY user_id) lh ON lh.user_id = u.user_id
        LEFT JOIN (SELECT user_id, GROUP_CONCAT(DISTINCT CONCAT_WS(', ', NULLIF(purok, ''), NULLIF(address, '')) ORDER BY household_id SEPARATOR '; ') location
            FROM households GROUP BY user_id) h ON h.user_id = u.user_id
        WHERE $condition ORDER BY " . ($sort === 'last_login' ? '(lh.last_login IS NULL) ASC, ' : '') . $sorts[$sort] . ' ' . strtoupper($direction) . ', u.user_id ASC';
    $export = ($_GET['export'] ?? '') === 'csv';
    if (!$export) $query .= " LIMIT $perPage OFFSET $offset";
    $stmt = $conn->prepare($query);
    $stmt->execute($params);
    if ($export) {
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="users.csv"');
        header('Cache-Control: no-store');
        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['Name', 'Email', 'Role', 'Access', 'Location', 'Status', 'Last login', 'Created at'], ',', '"', '');
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            $state = $row['registration_status'] === 'approved' ? (intval($row['is_active']) ? 'Active' : 'Deactivated') : ucfirst($row['registration_status']);
            $values = [$row['full_name'], $row['email'], $row['role'], $row['registration_status'] === 'approved' ? um_access($row['role']) : 'No access until approved', $row['location'], $state, $row['last_login'], $row['created_at']];
            fputcsv($out, array_map('um_csv_cell', $values), ',', '"', '');
        }
        fclose($out);
        $conn->commit();
    } else {
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) { $row['version'] = um_version($row); $row['access'] = $row['registration_status'] === 'approved' ? um_access($row['role']) : 'No access until approved'; } unset($row);
        $month = new DateTimeImmutable('first day of this month 00:00:00', new DateTimeZone(app_config('APP_TIMEZONE')));
        $dbZone = new DateTimeZone(app_config('DB_TIME_ZONE') ?: '+08:00');
        $stats = $conn->prepare("SELECT COUNT(*) total, COALESCE(SUM(is_active = 1 AND $approval = 'approved'), 0) active,
            COALESCE(SUM(is_active = 0 AND $approval = 'approved'), 0) inactive,
            COALESCE(SUM($approval = 'pending'), 0) requests, COALESCE(SUM($approval = 'rejected'), 0) rejected,
            COALESCE(SUM(created_at >= ? AND created_at < ?), 0) added_month FROM users u");
        $stats->execute([$month->setTimezone($dbZone)->format('Y-m-d H:i:s'), $month->modify('+1 month')->setTimezone($dbZone)->format('Y-m-d H:i:s')]);
        $summary = array_map('intval', $stats->fetch(PDO::FETCH_ASSOC));
        $conn->commit();
        header('Cache-Control: no-store');
        echo json_encode(['success' => true, 'data' => $rows, 'summary' => $summary,
            'pagination' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'pages' => $pages],
            'timezone' => app_config('APP_TIMEZONE'), 'timestamp_offset' => app_config('DB_TIME_ZONE')]);
    }
} catch (Throwable $e) { um_error($e, $conn); }

<?php
const HOUSEHOLD_VULNERABILITY_FLAGS = ['is_child','is_senior','is_pwd','is_pregnant','has_medical_needs','is_other_vulnerable'];

function household_member_name_key(string $name): string {
    return strtolower(preg_replace('/\s+/u', ' ', trim($name)));
}

function household_profile_from_members(array $household, array $people): array {
    $reasons = []; $heads = []; $identities = []; $ids = []; $vulnerable = 0; $vulnerabilityComplete = true;
    if (!$people) $reasons[] = 'Add every household member, including the household head.';
    foreach ($people as $person) {
        $name = household_member_name_key((string)($person['full_name'] ?? ''));
        $id = $person['member_id'] ?? null;
        $identity = $name . '|' . ($person['age'] ?? 'unknown');
        if (!$name || !$id || isset($ids[$id]) || isset($identities[$identity])) $reasons[] = 'Resolve duplicate or unidentified member records.';
        $ids[$id] = true; $identities[$identity] = true;
        if (in_array(household_member_name_key((string)($person['relationship'] ?? '')), ['head','household head'], true)) $heads[] = $name;
        $known = !empty($person['vulnerability_verified_at']) && !empty($person['vulnerability_verified_by']);
        $hasVulnerability = false;
        foreach (HOUSEHOLD_VULNERABILITY_FLAGS as $flag) {
            if (!isset($person[$flag]) || !in_array($person[$flag], [0,1,'0','1'], true)) $known = false;
            if (($person[$flag] ?? null) == 1) $hasVulnerability = true;
        }
        $age = $person['age'] ?? null;
        if ($age !== null && (filter_var($age,FILTER_VALIDATE_INT) === false || $age < 0 || $age > 150)) $known = false;
        if ($age !== null && ((int)($person['is_child'] ?? -1) !== ((int)$age < 18 ? 1 : 0) || (int)($person['is_senior'] ?? -1) !== ((int)$age >= 60 ? 1 : 0))) $known = false;
        if (!$known) $vulnerabilityComplete = false;
        if ($hasVulnerability) $vulnerable++;
    }
    if (count($heads) !== 1 || ($heads[0] ?? '') !== household_member_name_key((string)($household['head_of_family'] ?? ''))) $reasons[] = 'Include the named household head exactly once with relationship Head.';
    $rosterVerified = !empty($household['roster_verified_at']) && !empty($household['roster_verified_by']);
    if (!$rosterVerified) $reasons[] = 'An administrator must verify that the roster is complete.';
    $rosterValid = !$reasons;
    if (!$vulnerabilityComplete) $reasons[] = 'Verify vulnerability information for every person; unknown is not zero.';
    return ['size'=>$rosterValid ? count($people) : null,'vulnerable'=>$rosterValid && $vulnerabilityComplete ? $vulnerable : null,'complete'=>!$reasons,'reasons'=>array_values(array_unique($reasons)),'people'=>$people,'roster_verified'=>$rosterValid];
}

function household_verified_profile(PDO $conn, array $household): array {
    $stmt = $conn->prepare('SELECT * FROM household_members WHERE household_id=? ORDER BY member_id');
    $stmt->execute([$household['household_id']]);
    return household_profile_from_members($household, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function household_member_payload(array $data): array {
    foreach (['full_name','relationship'] as $key) {
        if (!isset($data[$key]) || !is_string($data[$key]) || trim($data[$key]) === '' || strlen($data[$key]) > ($key === 'full_name' ? 150 : 100)) throw new InvalidArgumentException('Enter a valid full name and relationship.');
    }
    $age = $data['age'] ?? null;
    if ($age === '') $age = null;
    if ($age !== null && (is_bool($age) || !is_scalar($age) || filter_var($age,FILTER_VALIDATE_INT) === false || $age < 0 || $age > 150)) throw new InvalidArgumentException('Age must be a whole number from 0 to 150, or blank when unknown.');
    $out = ['full_name'=>trim($data['full_name']),'relationship'=>trim($data['relationship']),'age'=>$age === null ? null : (int)$age];
    foreach (HOUSEHOLD_VULNERABILITY_FLAGS as $flag) {
        $value = $data[$flag] ?? null;
        if ($value !== null && !in_array($value,[true,false,0,1,'0','1'],true)) throw new InvalidArgumentException('Vulnerability fields must be yes, no, or unknown.');
        $out[$flag] = $value === null ? null : (int)$value;
    }
    if ($age !== null) { $out['is_child'] = (int)$age < 18 ? 1 : 0; $out['is_senior'] = (int)$age >= 60 ? 1 : 0; }
    $verified = $data['verify_vulnerability'] ?? false;
    if (!is_bool($verified)) throw new InvalidArgumentException('Vulnerability verification must be true or false.');
    if ($verified && in_array(null,array_intersect_key($out,array_flip(HOUSEHOLD_VULNERABILITY_FLAGS)),true)) throw new InvalidArgumentException('Answer every vulnerability category before verifying this person.');
    $out['vulnerability_verified_at'] = $verified ? date('Y-m-d H:i:s') : null;
    $out['vulnerability_verified_by'] = $verified ? (int)($_SESSION['user_id'] ?? 0) : null;
    return $out;
}

function household_invalidate_roster(PDO $conn, int $householdId): void {
    $conn->prepare('UPDATE households SET roster_verified_at=NULL,roster_verified_by=NULL WHERE household_id=?')->execute([$householdId]);
}

function household_assert_distinct_member(PDO $conn, int $householdId, array $member, int $exclude=0): void {
    $stmt = $conn->prepare('SELECT member_id,full_name,age FROM household_members WHERE household_id=? AND member_id<>?');
    $stmt->execute([$householdId,$exclude]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $existing) {
        if (household_member_name_key($existing['full_name']) === household_member_name_key($member['full_name']) && ($existing['age'] === null || $member['age'] === null || (int)$existing['age'] === $member['age'])) throw new InvalidArgumentException('This person is already on the roster. Edit the existing member instead.');
    }
}

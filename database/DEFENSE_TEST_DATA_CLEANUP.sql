-- =====================================================================
-- DEFENSE_TEST_DATA_CLEANUP.sql
-- Removes ONLY the synthetic "Typhoon Binitayan Defense Demonstration 2026"
-- test data, plus the records the application created FROM that data
-- during rehearsals or the defense (distributions, stock logs, feedback,
-- schedules for the test households, notifications of the test accounts).
--
-- HOW DEFENSE RECORDS ARE RECOGNISED (nothing else is touched):
--   * users ............ the 10 test e-mails (admin.binitayan.test, personnel.binitayan.test,
--                         binitayan.test01 ... binitayan.test08 @gmail.com)
--   * households ....... address contains "[DEFENSE TEST] H0"
--   * relief items ..... item_name ends with "[DEFENSE TEST]"
--   * evacuation centers, hazard alerts, weather logs, relief packages,
--     distribution schedules ... text contains "[DEFENSE TEST]"
--
-- SHARED E-MAILS: the older 8-household test seed ("[TEST DATA]" households,
-- seed_test_data_8_households.php) uses the same 10 e-mails. If any of these
-- accounts is still linked to a household that is NOT a defense household, the
-- 10 accounts are KEPT (only the defense records are removed), so the older test
-- data is never half-deleted. In that case import the defense data into a
-- separate, fresh database instead (see DEFENSE_TEST_DATA_IMPORT_GUIDE.md).
--
-- KEPT ON PURPOSE (audit trail): audit_logs, login_history and sms_logs rows are
-- not deleted. Their user link becomes empty (ON DELETE SET NULL) when the test
-- accounts are removed.
--
-- Safe to run more than once. No DROP / TRUNCATE / ALTER. Foreign key checks stay ON.
-- Child records are deleted before parent records.
-- Report / delivery photo FILES saved on disk by a live demo are not deleted by SQL
-- (backend/uploads/...); remove them by hand if needed.
-- =====================================================================

SET NAMES utf8mb4;
START TRANSACTION;

-- 0. Are the test e-mails still used by a NON-defense household (older test seed)?
--    0 = no -> the 10 test accounts are removed at the end; >0 = accounts are kept.
SET @accounts_shared := (SELECT COUNT(*) FROM households h JOIN users u ON u.user_id = h.user_id
                          WHERE u.email IN ('admin.binitayan.test@gmail.com','personnel.binitayan.test@gmail.com',
             'binitayan.test01@gmail.com','binitayan.test02@gmail.com','binitayan.test03@gmail.com','binitayan.test04@gmail.com',
             'binitayan.test05@gmail.com','binitayan.test06@gmail.com','binitayan.test07@gmail.com','binitayan.test08@gmail.com')
                            AND h.address NOT LIKE '%[DEFENSE TEST] H0%');

-- 1. Feedback that points to a test household, request or allocation
DELETE FROM relief_feedback
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%')
    OR request_id IN (SELECT request_id FROM relief_requests WHERE household_id IN
                        (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%'))
    OR allocation_id IN (SELECT allocation_id FROM relief_allocations WHERE
                        household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%')
                        OR item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]'));

-- 2. Schedule beneficiaries for test households (delivery reports and their
--    photo rows are removed automatically: ON DELETE CASCADE)
DELETE FROM distribution_beneficiaries
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%');

-- 3. Allocations of test households or of test items
DELETE FROM relief_allocations
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%')
    OR item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]');

-- 4. Request items and requests of test households (and any request line for a test item)
DELETE FROM relief_request_items
 WHERE item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]')
    OR request_id IN (SELECT request_id FROM relief_requests WHERE household_id IN
                        (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%'));
DELETE FROM relief_requests
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%');

-- 5. Rejected DSS recommendations for test households or test items
DELETE FROM relief_recommendation_rejections
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%')
    OR item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]');

-- 6. Distribution schedules marked as test data that now have no beneficiaries,
--    then test packages that no schedule uses
DELETE FROM distribution_schedules
 WHERE notes LIKE '%[DEFENSE TEST]%'
   AND schedule_id NOT IN (SELECT schedule_id FROM distribution_beneficiaries);
DELETE FROM relief_package_items
 WHERE item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]')
    OR package_id IN (SELECT package_id FROM relief_packages WHERE package_name LIKE '%[DEFENSE TEST]%'
                        AND package_id NOT IN (SELECT package_id FROM distribution_schedules));
DELETE FROM relief_packages
 WHERE package_name LIKE '%[DEFENSE TEST]%'
   AND package_id NOT IN (SELECT package_id FROM distribution_schedules);

-- 7. Inventory history, donations and the test relief items
DELETE FROM inventory_logs
 WHERE item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]');
DELETE FROM donations
 WHERE item_id IN (SELECT item_id FROM relief_items WHERE item_name LIKE '%[DEFENSE TEST]');
DELETE FROM relief_items
 WHERE item_name LIKE '%[DEFENSE TEST]';

-- 8. Damage assessments, report photos and disaster reports of the test households
DELETE FROM damage_assessments
 WHERE report_id IN (SELECT report_id FROM disaster_reports WHERE
          household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%'));
DELETE FROM report_photos
 WHERE report_id IN (SELECT report_id FROM disaster_reports WHERE
          household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%'));
DELETE FROM disaster_reports
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%');

-- 9. Household members and the test households
DELETE FROM household_members
 WHERE household_id IN (SELECT household_id FROM households WHERE address LIKE '%[DEFENSE TEST] H0%');
DELETE FROM households
 WHERE address LIKE '%[DEFENSE TEST] H0%';

-- 10. Test evacuation centers (their history rows first), hazard alerts, weather logs
DELETE FROM evacuation_center_logs
 WHERE center_id IN (SELECT center_id FROM evacuation_centers WHERE address LIKE '%[DEFENSE TEST]%');
DELETE FROM evacuation_centers
 WHERE address LIKE '%[DEFENSE TEST]%';
DELETE FROM hazard_alerts
 WHERE description LIKE '%[DEFENSE TEST]%';
DELETE FROM weather_logs
 WHERE remarks LIKE '%[DEFENSE TEST]%';

-- 11. In-app notifications of the test accounts, then the 10 test accounts
--     (only when they are not shared with the older test seed, see step 0).
--     Any report a test account filed without a defense household is removed with
--     the account (disaster_reports.user_id ON DELETE CASCADE).
DELETE FROM notifications
 WHERE @accounts_shared = 0
   AND user_id IN (SELECT user_id FROM users WHERE email IN ('admin.binitayan.test@gmail.com','personnel.binitayan.test@gmail.com',
             'binitayan.test01@gmail.com','binitayan.test02@gmail.com','binitayan.test03@gmail.com','binitayan.test04@gmail.com',
             'binitayan.test05@gmail.com','binitayan.test06@gmail.com','binitayan.test07@gmail.com','binitayan.test08@gmail.com'));
DELETE FROM users
 WHERE @accounts_shared = 0
   AND email IN ('admin.binitayan.test@gmail.com','personnel.binitayan.test@gmail.com',
             'binitayan.test01@gmail.com','binitayan.test02@gmail.com','binitayan.test03@gmail.com','binitayan.test04@gmail.com',
             'binitayan.test05@gmail.com','binitayan.test06@gmail.com','binitayan.test07@gmail.com','binitayan.test08@gmail.com');

SELECT IF(@accounts_shared = 0,
          'Defense test data removed, including the 10 test accounts.',
          'Defense test data removed. The 10 test accounts were KEPT because the older [TEST DATA] seed still uses them.') AS cleanup_result;

COMMIT;

-- Done. Re-import DEFENSE_TEST_DATA.sql to get a fresh defense dataset.

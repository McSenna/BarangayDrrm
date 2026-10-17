<?php
require_once __DIR__.'/../config/cors.php';
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/../lib/household_assessments.php';
require_login(['admin','relief_personnel','field_officer']);
if($_SERVER['REQUEST_METHOD']!=='GET'){http_response_code(405);echo json_encode(['success'=>false,'message'=>'Method not allowed.']);exit;}
ha_endpoint(fn()=>ha_list((new Database())->connect(),intval($_SESSION['user_id']),isset($_GET['household_id'])?ha_integer($_GET['household_id'],'household_id'):null));


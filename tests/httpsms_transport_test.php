<?php
if (extension_loaded('curl')) exit(2);
foreach (['CURLOPT_RETURNTRANSFER','CURLOPT_TIMEOUT','CURLOPT_CONNECTTIMEOUT','CURLOPT_POST','CURLOPT_HTTPHEADER','CURLOPT_POSTFIELDS','CURLINFO_HTTP_CODE'] as $i=>$n) define($n,$i+1);
function mb_substr($s,$a,$n) { return substr($s,$a,$n); }
function curl_init($url) { $GLOBALS['url']=$url; return new stdClass(); }
function curl_setopt($c,$k,$v) { $GLOBALS['options'][$k]=$v; }
function curl_exec($c) { $GLOBALS['calls']=($GLOBALS['calls']??0)+1; return $GLOBALS['reply']??'{"status":"success","data":{"id":"msg-42","status":"pending"}}'; }
function curl_getinfo($c,$k) { return $GLOBALS['http']??200; }
function curl_error($c) { return ''; }
function curl_close($c) {}
require __DIR__.'/../backend/sms/sms_helper.php';
function check($v,$m) { if(!$v) { fwrite(STDERR,"FAIL: $m\n"); exit(1); } }
check(function_exists('httpsms_send'),'httpSMS transport exists');
$s=['api_key'=>'dummy-secret','from'=>'+639171234567','base_url'=>'https://api.httpsms.com/v1/messages/send'];
$r=httpsms_send($s,['09123456789'],'Relief ready & available.',8);
$b=json_decode($GLOBALS['options'][CURLOPT_POSTFIELDS],true);
check($GLOBALS['url']===$s['base_url'],'endpoint');
check($b===['from'=>$s['from'],'to'=>'+639123456789','content'=>'Relief ready & available.'],'request payload');
check(in_array('x-api-key: dummy-secret',$GLOBALS['options'][CURLOPT_HTTPHEADER],true),'authentication');
check($r['ok'] && sms_provider_message_id($r['response'])==='msg-42','accepted message ID');
foreach(['bad','{}','{"status":"error","data":{"id":"id"}}','{"status":"success","data":{}}','{"status":"success","data":{"id":[]}}'] as $bad) {
 $GLOBALS['reply']=$bad; check(!httpsms_send($s,['09123456789'],'test',8)['ok'],'reject malformed response');
}
$GLOBALS['reply']='{"status":"success","data":{"id":"id"}}'; $GLOBALS['http']=401;
check(!httpsms_send($s,['09123456789'],'test',8)['ok'],'reject HTTP failure');
$GLOBALS['reply']='dummy-secret';
$r=httpsms_send($s,['09123456789'],'test',8);
check(!str_contains($r['error'].$r['response'],'dummy-secret'),'redact secrets');
$c=$GLOBALS['calls']; $s['from']='';
check(!httpsms_send($s,['09123456789'],'test',8)['ok'] && $GLOBALS['calls']===$c,'missing sender prevents request');
$s['from']='+639171234567';
check(!httpsms_send($s,['09123456789','09987654321'],'test',8)['ok'] && $GLOBALS['calls']===$c,'one recipient per request');
putenv('HTTPSMS_SMS_ENABLED=true'); putenv('HTTPSMS_API_KEY=test'); putenv('HTTPSMS_FROM= ');
check(!sms_config_state()['ready'],'missing sender is not configured');
putenv('HTTPSMS_FROM=09171234567');
check(sms_config_state()['ready'] && sms_config_state()['from']==='+639171234567','sender normalized');
echo "httpSMS offline checks passed.\n";

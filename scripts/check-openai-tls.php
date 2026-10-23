<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$request = curl_init('https://api.openai.com/v1/models');
curl_setopt_array($request, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
]);
$body = curl_exec($request);
$error = curl_errno($request);
$status = (int)curl_getinfo($request, CURLINFO_HTTP_CODE);
$verified = (int)curl_getinfo($request, CURLINFO_SSL_VERIFYRESULT);
curl_close($request);
unset($body);
// This probe deliberately sends no API key. HTTP 401 proves TLS, not account access.
echo json_encode(['tlsVerified' => $error === 0 && $verified === 0, 'httpStatus' => $status, 'curlError' => $error, 'verificationResult' => $verified], JSON_THROW_ON_ERROR), PHP_EOL;
exit($error === 0 && $verified === 0 && $status === 401 ? 0 : 1);

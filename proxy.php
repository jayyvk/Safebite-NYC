<?php
// Set headers to allow cross-origin requests
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

// Get the request URL from the query parameters
$apiUrl = isset($_GET['url']) ? $_GET['url'] : null;
$apiKey = 'YOUR_GOOGLE_API_KEY'; // Replace with your actual API key

// Check if the URL parameter is set
if (!$apiUrl) {
    echo json_encode(['error' => 'URL parameter is required']);
    exit;
}

// Validate that we're only making requests to Google APIs
if (strpos($apiUrl, 'https://maps.googleapis.com/maps/api/') !== 0) {
    echo json_encode(['error' => 'Only Google Maps API URLs are allowed']);
    exit;
}

// Build the complete URL with the API key
$completeUrl = $apiUrl;
if (strpos($completeUrl, '?') !== false) {
    $completeUrl .= '&key=' . $apiKey;
} else {
    $completeUrl .= '?key=' . $apiKey;
}

// Initialize cURL session
$ch = curl_init();

// Set cURL options
curl_setopt($ch, CURLOPT_URL, $completeUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);

// Execute cURL session and get the response
$response = curl_exec($ch);

// Check if there was an error with the cURL request
if (curl_errno($ch)) {
    echo json_encode(['error' => 'cURL error: ' . curl_error($ch)]);
    exit;
}

// Close cURL session
curl_close($ch);

// Output the response
echo $response;
?> 
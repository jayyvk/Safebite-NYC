# SafeBite NYC - Google Places Integration

This README explains how to set up and use the Google Places API integration to fetch real restaurant images for the SafeBite NYC application.

## Prerequisites

1. A Google Cloud Platform account
2. A PHP server to run the proxy script (for local development, you can use XAMPP, WAMP, or similar software)

## Setup Instructions

### 1. Set up Google Cloud Platform

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the following APIs:
   - Google Maps Places API
   - Google Maps JavaScript API

### 2. Create API Key

1. In Google Cloud Console, go to "APIs & Services" > "Credentials"
2. Click "+ CREATE CREDENTIALS" and select "API key"
3. Copy the generated API key
4. (Optional but recommended) Restrict the API key to only the Places API and your domain

### 3. Update Configuration Files

1. In `script.js`, replace `YOUR_API_KEY_HERE` with your actual Google Places API key:
   ```javascript
   const GOOGLE_PLACES_API_KEY = 'YOUR_ACTUAL_KEY_HERE';
   ```

2. In `proxy.php`, replace `YOUR_GOOGLE_API_KEY` with your actual API key:
   ```php
   $apiKey = 'YOUR_ACTUAL_KEY_HERE';
   ```

### 4. Set Up PHP Proxy

1. Make sure your web server supports PHP
2. Place the `proxy.php` file in the same directory as your other project files
3. Ensure the web server has proper permissions to execute the PHP file

## How It Works

The integration uses the Google Places API to:

1. Search for a restaurant by name and address
2. Retrieve the top matching result and its photos
3. Display the restaurant images on both the main cards and in the details modal

If no matching Google Places result is found, or if the API call fails, the system falls back to using cuisine-based stock images.

## Troubleshooting

If you encounter issues with the Places API integration:

1. Check the browser console for error messages
2. Verify your API key is correct and has the necessary permissions
3. Make sure your API key is not restricted to specific referrers that don't include your testing domain
4. Check if you've reached your API quota limits

## API Quotas and Billing

The Google Places API is a paid service with the following pricing tiers:

- Basic fields: $17 per 1,000 requests
- Contact fields: $13.50 per 1,000 requests (additional)
- Atmosphere fields: $13.50 per 1,000 requests (additional)

Photos are included in the Basic fields pricing.

Make sure to set up proper billing in your Google Cloud account to avoid service interruptions.

## Security Considerations

1. Never expose your API key directly in client-side JavaScript without restrictions
2. Use the PHP proxy to keep your API key secure
3. Set appropriate referrer restrictions on your API key
4. Consider implementing rate limiting to prevent abuse

For more information on the Google Places API, visit the [official documentation](https://developers.google.com/maps/documentation/places/web-service/overview). 
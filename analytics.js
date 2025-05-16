// Vercel Analytics script for SafeBite NYC
// This script initializes Vercel Analytics for the application

// Load Vercel Analytics from CDN
(function() {
  const script = document.createElement('script');
  script.src = 'https://cdn.vercel-insights.com/v1/script.js';
  script.defer = true;
  script.setAttribute('data-endpoint', '/va');
  
  // Append script to head
  document.head.appendChild(script);
  
  // Function to manually track events if needed
  window.trackEvent = function(eventName, eventData) {
    if (window.va) {
      window.va('event', {
        name: eventName,
        data: eventData
      });
    }
  };
  
  console.log('Vercel Analytics initialized');
})(); 
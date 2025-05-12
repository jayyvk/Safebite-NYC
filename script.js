// Initialize Supabase client
const SUPABASE_URL = 'https://ierqbfleikjernllbpvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcnFiZmxlaWtqZXJubGxicHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4Mzk1MDIsImV4cCI6MjA2MjQxNTUwMn0.YL-JeNy_rKXw_hAlVHkJxnoIutNDSmF9xNcz8RZwr8s';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let mapInstance = null;
let currentFilters = {};
// Google Places API key - you need to replace this with your actual API key
const GOOGLE_PLACES_API_KEY = 'AIzaSyAHsCSyXkLpZtwYBivWJ_Dja9H5vARtOF4'; 

// Add loading state
function setLoading(isLoading) {
  const grid = document.getElementById('restaurantGrid');
  if (isLoading) {
    grid.innerHTML = `
      <div class="col-span-full flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    `;
  }
}

async function fetchRestaurants(filters = {}) {
  setLoading(true);
  currentFilters = filters;
  
  try {
    let query = supabase.from('restaurants').select('*');

    // Apply filters
    if (filters.grade) {
      query = query.eq('grade', filters.grade);
    }
    
    if (filters.borough) {
      query = query.eq('borough', filters.borough);
    }
    
    // Handle cuisine filtering differently - build filter string explicitly
    if (filters.cuisine) {
      // First try to check if cuisine field contains the value
      const { data: cuisineData, error: cuisineError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('cuisine', filters.cuisine);
      
      // Then check if cuisine_type field contains the value
      const { data: cuisineTypeData, error: cuisineTypeError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('cuisine_type', filters.cuisine);
      
      // Combine results from both queries
      let restaurantIds = [];
      
      if (!cuisineError && cuisineData && cuisineData.length > 0) {
        restaurantIds = restaurantIds.concat(cuisineData.map(r => r.id));
      }
      
      if (!cuisineTypeError && cuisineTypeData && cuisineTypeData.length > 0) {
        restaurantIds = restaurantIds.concat(cuisineTypeData.map(r => r.id));
      }
      
      // Filter by these IDs if we found any matches
      if (restaurantIds.length > 0) {
        query = query.in('id', restaurantIds);
      } else {
        // No results found for this cuisine, return empty result
        renderRestaurants([]);
        setLoading(false);
        return;
      }
    }
    
    // Handle search filter
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,address.ilike.%${filters.search}%`);
    }

    // Execute the final query
    const { data, error } = await query;
    
    if (error) {
      console.error('Supabase fetch error:', error);
      showNotification('Error loading restaurants', 'error');
      return;
    }

    // Enrich data with restaurant photos from Google Places API
    const enhancedData = await enrichRestaurantsWithGooglePhotos(data);
    renderRestaurants(enhancedData);
  } catch (err) {
    console.error('Error fetching restaurants:', err);
    showNotification('An error occurred while fetching restaurants', 'error');
  } finally {
    setLoading(false);
  }
}

// Function to fetch restaurant images from Google Places API
async function enrichRestaurantsWithGooglePhotos(restaurants) {
  const enhancedRestaurants = [];
  
  // Process restaurants in batches to avoid too many concurrent requests
  const batchSize = 5;
  for (let i = 0; i < restaurants.length; i += batchSize) {
    const batch = restaurants.slice(i, i + batchSize);
    const promises = batch.map(restaurant => fetchGooglePlacePhoto(restaurant));
    const results = await Promise.all(promises);
    enhancedRestaurants.push(...results);
  }
  
  return enhancedRestaurants;
}

// Function to fetch a restaurant photo from Google Places API
async function fetchGooglePlacePhoto(restaurant) {
  try {
    // First, search for the place to get its place_id and photo references
    const searchQuery = `${restaurant.name} ${restaurant.address}`;
    const placeData = await findPlaceWithTextSearch(searchQuery);
    
    if (placeData && placeData.photo_url) {
      // Add the photo URL to the restaurant object
      return { ...restaurant, google_photo_url: placeData.photo_url };
    }
    
    // If no result was found, return the original restaurant
    return restaurant;
  } catch (error) {
    console.error(`Error fetching Google photo for ${restaurant.name}:`, error);
    return restaurant;
  }
}

// Function to search for a place using Google Places API Text Search
async function findPlaceWithTextSearch(searchQuery) {
  try {
    // Using our local PHP proxy instead of cors-anywhere
    const proxyUrl = 'proxy.php?url=';
    const apiUrl = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
    
    // We don't need to include the API key in the URL as our PHP proxy will add it
    const response = await fetch(`${proxyUrl}${encodeURIComponent(apiUrl)}?query=${encodeURIComponent(searchQuery)}`);
    
    if (!response.ok) {
      throw new Error(`Google Places API response error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const place = data.results[0];
      
      // Check if the place has photos
      if (place.photos && place.photos.length > 0) {
        const photoReference = place.photos[0].photo_reference;
        // Construct the photo URL - we'll directly reference the Google API for photos
        // as they are image responses, not JSON
        const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${GOOGLE_PLACES_API_KEY}`;
        
        return {
          place_id: place.place_id,
          photo_url: photoUrl,
          name: place.name,
          vicinity: place.vicinity || place.formatted_address
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error in findPlaceWithTextSearch:', error);
    return null;
  }
}

// Backup method to get a place photo using place ID
async function getPlacePhotoByPlaceId(placeId) {
  try {
    // Using our local PHP proxy
    const proxyUrl = 'proxy.php?url=';
    const apiUrl = 'https://maps.googleapis.com/maps/api/place/details/json';
    
    const response = await fetch(`${proxyUrl}${encodeURIComponent(apiUrl)}?place_id=${placeId}&fields=photos`);
    
    if (!response.ok) {
      throw new Error(`Google Places API response error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.result && data.result.photos && data.result.photos.length > 0) {
      const photoReference = data.result.photos[0].photo_reference;
      return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${GOOGLE_PLACES_API_KEY}`;
    }
    
    return null;
  } catch (error) {
    console.error('Error in getPlacePhotoByPlaceId:', error);
    return null;
  }
}

function renderRestaurants(restaurants) {
  const grid = document.getElementById('restaurantGrid');
  grid.innerHTML = '';
  
  if (!restaurants || restaurants.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full empty-state">
        <i class="fas fa-utensils"></i>
        <h3 class="text-xl font-semibold mb-2">No restaurants found</h3>
        <p>Try adjusting your filters or search terms</p>
      </div>
    `;
    return;
  }

  // Get cuisine emojis mapping
  const cuisineEmojis = {
    // Primary cuisines from the curated list
    'American': '🍔',
    'Chinese': '🥡',
    'Italian': '🍝',
    'Japanese': '🍣',
    'Indian': '🍛',
    'Korean': '🍲',
    'Thai': '🍜',
    'Mexican': '🌮',
    'Greek': '🥙',
    'French': '🥖',
    'Middle Eastern': '🧆',
    'Caribbean': '🌴',
    'Vietnamese': '🍜',
    'Bakery Products/Desserts': '🍰',
    'Sandwiches': '🥪',
    'Pizza': '🍕',
    'Seafood': '🦞',
    'Vegetarian': '🥗',
    'Vegan': '🥬',
    
    // Other common cuisines that might be in the database
    'Latin': '🌯',
    'Latin American': '🌯',
    'Mediterranean': '🫒',
    'Bakery': '🥐',
    'Café/Coffee/Tea': '☕',
    'Coffee/Tea': '☕',
    'Soul Food': '🍗',
    'Delicatessen': '🥓',
    'African': '🍲',
    'Spanish': '🥘',
    'Peruvian': '🌽',
    'Hamburgers': '🍔',
    'Jewish/Kosher': '✡️',
    
    // Fallback for any other cuisine
    'Other': '🍴'
  };

  // Get grade emoji mapping
  const gradeEmojis = {
    'A': '🏆',
    'B': '👍',
    'C': '⚠️',
    'N/A': '❓',
    'PENDING': '⏳'
  };
  
  restaurants.forEach(restaurant => {
    // Check for cuisine property with fallback options
    const cuisine = restaurant.cuisine || restaurant.cuisine_type || 'Other';
    const cuisineEmoji = cuisineEmojis[cuisine] || '🍴';
    const gradeClass = `grade-${restaurant.grade || 'NA'}`;
    const gradeEmoji = gradeEmojis[restaurant.grade] || '❓';
    
    // Get the restaurant image - either from Google Places API or a fallback based on cuisine
    const imageUrl = restaurant.google_photo_url || getRestaurantImageUrl(restaurant);
    
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-image">
        <img src="${imageUrl}" alt="${restaurant.name}" loading="lazy" 
             onerror="handleImageError(this, '${restaurant.name.replace(/'/g, "\\'")}')" />
      </div>
      <div class="card-content">
        <div class="card-header">
          <h3 class="card-title">${restaurant.name}</h3>
          <span class="grade-badge ${gradeClass}">
            ${restaurant.grade || 'N/A'}
          </span>
        </div>
        <div class="card-details">
          <div class="card-detail-item">
            <span class="card-icon"><i class="fas fa-map-marker-alt"></i></span>
            <span class="card-text">${restaurant.address}</span>
          </div>
          <div class="card-detail-item">
            <span class="card-icon"><i class="fas fa-utensils"></i></span>
            <span class="card-text">${cuisineEmoji} ${cuisine}</span>
          </div>
          <div class="card-detail-item">
            <span class="card-icon"><i class="fas fa-calendar-alt"></i></span>
            <span class="card-text">Last Inspection: ${formatDate(restaurant.inspection_date)}</span>
          </div>
        </div>
        <div class="card-footer">
          <button 
            onclick="handleViewDetails(${restaurant.id})" 
            class="btn-primary w-full flex justify-center items-center"
          >
            <i class="fas fa-info-circle mr-2"></i>
            <span>View Details</span>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg text-white ${
    type === 'success' ? 'bg-green-600' : 'bg-red-600'
  } transition-opacity duration-300`;
  notification.innerHTML = `
    <div class="flex items-center">
      <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} mr-2"></i>
      ${message}
    </div>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Open the details modal for a restaurant
async function handleViewDetails(restaurantId) {
  if (isNaN(parseInt(restaurantId, 10))) {
    console.error('Invalid restaurant ID:', restaurantId);
    showNotification('Error loading restaurant details', 'error');
    return;
  }

  const modal = document.getElementById('detailsModal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  // Reset the review form and clear previous restaurant details
  resetReviewForm();
  clearRestaurantDetails();
  
  try {
    // Fetch restaurant details
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', parseInt(restaurantId, 10))
      .single();

    if (error) {
      console.error('Error fetching restaurant:', error);
      showNotification('Error loading restaurant details', 'error');
      return;
    }

    if (!restaurant) {
      console.error('Restaurant not found');
      showNotification('Restaurant not found', 'error');
      return;
    }

    // Set restaurant details in the modal
    await loadRestaurantDetails(restaurant);

    // Check if user is logged in to show/hide review form
    const { data: { user } } = await supabase.auth.getUser();
    document.getElementById('reviewFormContainer').style.display = user ? 'block' : 'none';

  } catch (err) {
    console.error('Error in handleViewDetails:', err);
    showNotification('An error occurred while loading restaurant details', 'error');
  }
}

// Load restaurant details into modal
async function loadRestaurantDetails(restaurant) {
  // Clear previous details
  clearRestaurantDetails();
  
  // Get the restaurant image - either from Google Places API or a fallback based on cuisine
  let imageUrl = restaurant.google_photo_url;
  
  // If we don't have a Google photo URL already, try to fetch one
  if (!imageUrl) {
    const searchQuery = `${restaurant.name} ${restaurant.address}`;
    const placeData = await findPlaceWithTextSearch(searchQuery);
    
    if (placeData && placeData.photo_url) {
      imageUrl = placeData.photo_url;
    } else {
      // Use the cuisine-based image as fallback
      imageUrl = getRestaurantImageUrl(restaurant);
    }
  }
  
  // Set restaurant details
  document.getElementById('modalRestaurantTitle').textContent = restaurant.name;
  document.getElementById('modalRestaurantAddress').textContent = restaurant.address;
  
  // Add restaurant image to modal
  const modalHeader = document.querySelector('.restaurant-header');
  const imageContainer = document.createElement('div');
  imageContainer.innerHTML = `<img src="${imageUrl}" alt="${restaurant.name}" class="modal-image" onerror="handleImageError(this, '${restaurant.name.replace(/'/g, "\\'")}')" />`;
  modalHeader.insertAdjacentElement('beforebegin', imageContainer);
  
  // Determine the cuisine with fallback
  const cuisine = restaurant.cuisine || restaurant.cuisine_type || 'Unknown';
  const cuisineEmoji = getCuisineEmoji(cuisine);
  
  // Format the inspection date
  const inspectionDate = formatDate(restaurant.inspection_date);
  
  // Handle the grade display
  const gradeDisplay = restaurant.grade ? 
    `<span class="grade-badge grade-${restaurant.grade}">${restaurant.grade}</span>` : 
    '<span class="grade-badge grade-NA">N/A</span>';
  
  // Set other restaurant details
  document.getElementById('modalRestaurantDetails').innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
      <div>
        <p><i class="fas fa-utensils text-gray-500 mr-2"></i> <strong>Cuisine:</strong> ${cuisineEmoji} ${cuisine}</p>
        <p><i class="fas fa-calendar-check text-gray-500 mr-2"></i> <strong>Last Inspection:</strong> ${inspectionDate}</p>
      </div>
      <div>
        <p><i class="fas fa-clipboard-check text-gray-500 mr-2"></i> <strong>Grade:</strong> ${gradeDisplay}</p>
        <p><i class="fas fa-map-marker-alt text-gray-500 mr-2"></i> <strong>Borough:</strong> ${restaurant.borough || 'Unknown'}</p>
      </div>
    </div>
  `;
  
  // Load map
  loadMap(restaurant);
  
  // Load reviews
  await loadReviews(restaurant.id);
  
  // Show the modal
  document.getElementById('detailsModal').classList.remove('hidden');
  
  // Store restaurant ID for reviews
  document.getElementById('modalRestaurantId').value = restaurant.id;
  
  // Update login status and review form visibility
  updateReviewFormVisibility();
}

// Helper function to get cuisine emoji (for modal)
function getCuisineEmoji(cuisine) {
  const cuisineEmojis = {
    'American': '🍔',
    'Chinese': '🥡',
    'Italian': '🍝',
    'Japanese': '🍣',
    'Indian': '🍛',
    'Korean': '🍲',
    'Thai': '🍜',
    'Mexican': '🌮',
    'Greek': '🥙',
    'French': '🥖',
    'Middle Eastern': '🧆',
    'Caribbean': '🌴',
    'Vietnamese': '🍜',
    'Bakery Products/Desserts': '🍰',
    'Sandwiches': '🥪',
    'Pizza': '🍕',
    'Seafood': '🦞',
    'Vegetarian': '🥗',
    'Vegan': '🥬',
    'Latin': '🌯',
    'Latin American': '🌯',
    'Mediterranean': '🫒',
    'Bakery': '🥐',
    'Café/Coffee/Tea': '☕',
    'Coffee/Tea': '☕',
    'Soul Food': '🍗',
    'Delicatessen': '🥓',
    'African': '🍲',
    'Spanish': '🥘',
    'Peruvian': '🌽',
    'Hamburgers': '🍔',
    'Jewish/Kosher': '✡️'
  };
  
  return cuisineEmojis[cuisine] || '🍴';
}

// Function to handle image loading errors
function handleImageError(img, restaurantName) {
  // Set a default backup image
  img.src = 'https://images.unsplash.com/photo-1532635241-17e820acc59f?q=80&w=800';
  
  // Add a small notice class
  img.classList.add('fallback-image');
  
  // Log for debugging
  console.log(`Image failed to load for: ${restaurantName}`);
}

// Function to get a placeholder image URL based on restaurant cuisine type
function getRestaurantImageUrl(restaurant) {
  const cuisine = restaurant.cuisine || restaurant.cuisine_type || 'Other';
  
  // Map cuisines to appropriate food images
  const cuisineImageMap = {
    'American': 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800',
    'Chinese': 'https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=800',
    'Italian': 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?q=80&w=800',
    'Japanese': 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?q=80&w=800',
    'Indian': 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?q=80&w=800',
    'Korean': 'https://images.unsplash.com/photo-1532347231146-80afc9e3df2b?q=80&w=800',
    'Thai': 'https://images.unsplash.com/photo-1559314809-0d155014e29e?q=80&w=800',
    'Mexican': 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=800',
    'Greek': 'https://images.unsplash.com/photo-1600335895229-6e75511892c8?q=80&w=800',
    'French': 'https://images.unsplash.com/photo-1608855238293-a8853e7f7c98?q=80&w=800',
    'Middle Eastern': 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?q=80&w=800',
    'Caribbean': 'https://images.unsplash.com/photo-1566906278504-3b56920844a5?q=80&w=800',
    'Vietnamese': 'https://images.unsplash.com/photo-1557872943-16a5ac26437e?q=80&w=800',
    'Bakery Products/Desserts': 'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?q=80&w=800',
    'Bakery': 'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?q=80&w=800',
    'Sandwiches': 'https://images.unsplash.com/photo-1554433607-66b5efe9d304?q=80&w=800',
    'Pizza': 'https://images.unsplash.com/photo-1594007654729-407eedc4fe24?q=80&w=800',
    'Seafood': 'https://images.unsplash.com/photo-1579767684611-5da6bcea8416?q=80&w=800',
    'Vegetarian': 'https://images.unsplash.com/photo-1608032364895-84578f805572?q=80&w=800',
    'Vegan': 'https://images.unsplash.com/photo-1532768778661-0d4888e94541?q=80&w=800',
    'Hamburgers': 'https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=800',
    'Coffee/Tea': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800',
    'Café/Coffee/Tea': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=800',
    'Delicatessen': 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?q=80&w=800',
    'Latin': 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?q=80&w=800',
    'Latin American': 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?q=80&w=800',
    'Mediterranean': 'https://images.unsplash.com/photo-1594007654729-407eedc4fe24?q=80&w=800'
  };
  
  // Return the image for the cuisine or a default
  return cuisineImageMap[cuisine] || 'https://images.unsplash.com/photo-1532635241-17e820acc59f?q=80&w=800';
}

// Clear restaurant details from the modal
function clearRestaurantDetails() {
  // Clear title, address, and details
  document.getElementById('modalRestaurantTitle').textContent = '';
  document.getElementById('modalRestaurantAddress').textContent = '';
  document.getElementById('modalRestaurantDetails').innerHTML = '';
  
  // Remove any existing restaurant image
  const existingImage = document.querySelector('.modal-image');
  if (existingImage) {
    existingImage.parentElement.remove();
  }
  
  // Clear the map
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  
  // Clear reviews
  document.getElementById('reviewsList').innerHTML = '';
  
  // Reset the review form
  resetReviewForm();
}

// Close the details modal
function closeDetailsModal() {
  const modal = document.getElementById('detailsModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  clearRestaurantDetails();
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('gradeFilter').value = '';
  document.getElementById('boroughFilter').value = '';
  document.getElementById('cuisineFilter').value = '';
  fetchRestaurants();
}

async function logout() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showNotification('Error signing out', 'error');
      return;
    }
    
    // Clear any local state
    currentUser = null;
    
    // Redirect to login page
    window.location.href = 'login.html';
  } catch (err) {
    console.error('Logout error:', err);
    showNotification('Error signing out', 'error');
  }
}

// Update the loadUser function to properly handle auth state
async function loadUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      throw error;
    }

    if (user) {
      currentUser = user;
      document.getElementById('userEmail')?.classList.remove('hidden');
      document.getElementById('userEmail').textContent = user.email;
      document.getElementById('loginButton')?.classList.add('hidden');
      document.getElementById('logoutButton')?.classList.remove('hidden');
      
      // Add click event listener to logout button
      const logoutBtn = document.getElementById('logoutButton');
      if (logoutBtn) {
        // Remove any existing listeners
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        newLogoutBtn.addEventListener('click', logout);
      }
    } else {
      currentUser = null;
      document.getElementById('userEmail')?.classList.add('hidden');
      document.getElementById('loginButton')?.classList.remove('hidden');
      document.getElementById('logoutButton')?.classList.add('hidden');
    }
  } catch (err) {
    console.error('Error loading user:', err);
    showNotification('Error loading user session', 'error');
  }
}

// Add auth state change listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    currentUser = null;
    document.getElementById('userEmail')?.classList.add('hidden');
    document.getElementById('loginButton')?.classList.remove('hidden');
    document.getElementById('logoutButton')?.classList.add('hidden');
  } else if (event === 'SIGNED_IN') {
    loadUser();
  }
});

// Event Listeners
document.getElementById('applyFilters')?.addEventListener('click', () => {
  const filters = {
    grade: document.getElementById('gradeFilter').value,
    borough: document.getElementById('boroughFilter').value,
    cuisine: document.getElementById('cuisineFilter').value,
    search: document.getElementById('searchInput').value.trim()
  };
  fetchRestaurants(filters);
});

document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('applyFilters').click();
  }
});

// Star rating functionality
function initializeStarRating() {
  const starContainer = document.getElementById('starRating');
  if (!starContainer) return;
  
  const ratingInput = document.getElementById('rating');
  const stars = starContainer.querySelectorAll('span');
  
  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const rating = parseInt(star.dataset.rating, 10);
      updateStars(rating);
    });
    
    star.addEventListener('click', () => {
      const rating = parseInt(star.dataset.rating, 10);
      ratingInput.value = rating;
      updateStars(rating);
    });
  });
  
  starContainer.addEventListener('mouseleave', () => {
    const currentRating = ratingInput.value ? parseInt(ratingInput.value, 10) : 0;
    updateStars(currentRating);
  });
}

function updateStars(rating) {
  const stars = document.querySelectorAll('#starRating span');
  stars.forEach(star => {
    const starRating = parseInt(star.dataset.rating, 10);
    star.style.color = starRating <= rating ? '#FCD34D' : '#D1D5DB';
  });
}

// Load reviews for a specific restaurant
async function loadReviews(restaurantId) {
  restaurantId = parseInt(restaurantId, 10);
  const reviewsList = document.getElementById('reviewsList');
  reviewsList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner animate-spin text-blue-500 text-xl"></i></div>';
  
  try {
    const { data: reviews, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });
      
    if (error) {
      throw error;
    }
    
    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-comment-slash"></i>
          <p>No reviews yet. Be the first to review!</p>
        </div>
      `;
      return;
    }
    
    reviewsList.innerHTML = '';
    
    // Get current user data for edit/delete functionality
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    reviews.forEach(review => {
      const reviewElement = document.createElement('div');
      reviewElement.className = 'review-card';
      
      // Format date
      const reviewDate = new Date(review.created_at);
      const formattedDate = reviewDate.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
      
      // Generate stars
      let stars = '';
      for (let i = 1; i <= 5; i++) {
        stars += `<span class="${i <= review.rating ? 'star-filled' : 'star-empty'}">★</span>`;
      }
      
      // Check if user can edit/delete this review
      // User can edit/delete if:
      // 1. User is logged in AND
      // 2. Either the review is by this user OR the review has no user_id (anonymous)
      const isUserReview = user && (
        review.user_id === user.id || 
        !review.user_id || 
        review.user_id === null
      );
      
      const actionButtons = isUserReview ? `
        <div class="flex space-x-2 mt-2">
          <button onclick="editReview(${review.id})" class="text-blue-500 hover:text-blue-700 text-sm">
            <i class="fas fa-edit mr-1"></i>Edit
          </button>
          <button onclick="deleteReview(${review.id})" class="text-red-500 hover:text-red-700 text-sm">
            <i class="fas fa-trash-alt mr-1"></i>Delete
          </button>
        </div>
      ` : '';
      
      reviewElement.innerHTML = `
        <div class="review-meta">
          <span class="font-medium">${review.user_name || 'Anonymous'}</span>
          <span class="text-sm text-gray-500">${formattedDate}</span>
        </div>
        <div class="review-rating">${stars}</div>
        <p class="text-gray-700">${review.comment}</p>
        ${actionButtons}
      `;
      
      reviewsList.appendChild(reviewElement);
    });
  } catch (error) {
    console.error('Error loading reviews:', error);
    reviewsList.innerHTML = `
      <div class="text-center py-4 text-red-500">
        <i class="fas fa-exclamation-circle mr-2"></i>
        Error loading reviews. Please try again.
      </div>
    `;
  }
}

// Submit or update a review
async function handleReviewSubmit(e) {
  e.preventDefault();
  
  try {
    const restaurantIdInput = document.getElementById('modalRestaurantId').value;
    if (!restaurantIdInput) {
      showNotification('No restaurant selected', 'error');
      return;
    }
    
    const restaurantId = parseInt(restaurantIdInput, 10);
    if (isNaN(restaurantId)) {
      console.error('Invalid restaurant ID for review submission:', restaurantIdInput);
      showNotification('Invalid restaurant ID', 'error');
      return;
    }
    
    const rating = parseInt(document.getElementById('rating').value, 10);
    const comment = document.getElementById('comment').value.trim();
    const userName = document.getElementById('reviewerName').value.trim() || 'Anonymous';
    const reviewId = document.getElementById('reviewId').value;

    if (!rating) {
      showNotification('Please select a rating', 'error');
      return;
    }
    
    if (!comment) {
      showNotification('Please enter a review comment', 'error');
      return;
    }

    // Check if user is logged in
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    // We'll allow anonymous reviews but log a warning
    if (userError || !user) {
      console.warn('User not logged in when submitting review. Will be stored as anonymous.');
    }

    // Prepare review data object
    const reviewData = {
      restaurant_id: restaurantId,
      rating,
      comment,
      user_name: userName,
      // Store user_id if available, otherwise null
      user_id: user ? user.id : null,
      created_at: new Date().toISOString()
    };

    console.log('Submitting review for restaurant:', restaurantId, reviewData);

    let result;
    if (reviewId) {
      // Verify permission to edit if we have a reviewId
      if (reviewId) {
        const { data: existingReview, error: fetchError } = await supabase
          .from('reviews')
          .select('*')
          .eq('id', reviewId)
          .single();
          
        if (fetchError) {
          console.error('Error checking existing review:', fetchError);
          showNotification('Error verifying review ownership', 'error');
          return;
        }
        
        // Only allow editing if the review is by the current user or is anonymous
        const canEdit = !existingReview.user_id || 
                        (user && existingReview.user_id === user.id);
        
        if (!canEdit) {
          showNotification('You can only edit your own reviews', 'error');
          return;
        }
      }
    
      // Update existing review
      result = await supabase
        .from('reviews')
        .update(reviewData)
        .eq('id', reviewId);
    } else {
      // Insert new review
      result = await supabase
        .from('reviews')
        .insert([reviewData]);
    }

    if (result.error) {
      console.error('Error saving review:', result.error);
      showNotification(`Error submitting review: ${result.error.message}`, 'error');
      return;
    }

    showNotification('Review submitted successfully!', 'success');
    
    // Reset form and reload reviews
    resetReviewForm();
    await loadReviews(restaurantId);
  } catch (err) {
    console.error('Error in handleReviewSubmit:', err);
    showNotification('An unexpected error occurred while submitting your review', 'error');
  }
}

// Load a review for editing
async function editReview(reviewId) {
  if (isNaN(parseInt(reviewId, 10))) {
    console.error('Invalid review ID for editing');
    showNotification('Error loading review', 'error');
    return;
  }

  try {
    // Fetch the review
    const { data: review, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', parseInt(reviewId, 10))
      .single();

    if (error) {
      console.error('Error fetching review for editing:', error);
      showNotification('Error loading review', 'error');
      return;
    }
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Error getting user:', userError);
      showNotification('Please log in to edit a review', 'error');
      return;
    }
    
    // Check if user has permission to edit this review
    // Allow editing if user_id matches or if the review doesn't have a user_id (anonymous)
    const canEdit = user && (
      review.user_id === user.id || 
      !review.user_id || 
      review.user_id === null
    );
    
    if (!canEdit) {
      showNotification('You can only edit your own reviews', 'error');
      return;
    }

    // Populate the form with review data
    document.getElementById('reviewId').value = review.id;
    document.getElementById('rating').value = review.rating;
    document.getElementById('comment').value = review.comment;
    document.getElementById('reviewerName').value = review.user_name || '';
    document.getElementById('submitButtonText').textContent = 'Update Review';
    document.getElementById('cancelEdit').classList.remove('hidden');
    document.getElementById('reviewSuccess').classList.add('hidden');
    
    updateStars(review.rating);
    document.getElementById('reviewForm').scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    console.error('Error in editReview:', err);
    showNotification('An unexpected error occurred while loading the review', 'error');
  }
}

// Delete a review
async function deleteReview(reviewId) {
  if (isNaN(parseInt(reviewId, 10))) {
    console.error('Invalid review ID for deletion');
    showNotification('Error deleting review', 'error');
    return;
  }

  if (!confirm('Are you sure you want to delete this review?')) return;

  try {
    // First, fetch the review to check permissions
    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select('*')
      .eq('id', parseInt(reviewId, 10))
      .single();
    
    if (fetchError) {
      console.error('Error fetching review for deletion:', fetchError);
      showNotification('Error retrieving review details', 'error');
      return;
    }
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('Error getting user:', userError);
      showNotification('Please log in to delete a review', 'error');
      return;
    }
    
    // Check if user has permission to delete this review
    // Allow deletion if user_id matches or if the review doesn't have a user_id (anonymous)
    const canDelete = user && (
      review.user_id === user.id || 
      !review.user_id || 
      review.user_id === null
    );
    
    if (!canDelete) {
      showNotification('You can only delete your own reviews', 'error');
      return;
    }
    
    // Perform the delete operation
    const { error: deleteError } = await supabase
      .from('reviews')
      .delete()
      .eq('id', parseInt(reviewId, 10));

    if (deleteError) {
      console.error('Error deleting review:', deleteError);
      showNotification('Error deleting review: ' + deleteError.message, 'error');
      return;
    }

    showNotification('Review deleted successfully!', 'success');
    
    // Reload reviews for the current restaurant
    const restaurantId = document.getElementById('modalRestaurantId').value;
    if (restaurantId) {
      await loadReviews(restaurantId);
    }
  } catch (err) {
    console.error('Error in deleteReview:', err);
    showNotification('An unexpected error occurred while deleting the review', 'error');
  }
}

// Reset review form to default state
function resetReviewForm() {
  document.getElementById('reviewForm').reset();
  document.getElementById('rating').value = '';
  document.getElementById('reviewId').value = '';
  document.getElementById('submitButtonText').textContent = 'Submit Review';
  document.getElementById('cancelEdit').classList.add('hidden');
  document.getElementById('reviewSuccess').classList.add('hidden');
  updateStars(0);
}

// Cancel editing a review
function cancelEdit() {
  resetReviewForm();
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  fetchRestaurants();
  loadUser();
  
  // Review-related event listeners
  const reviewForm = document.getElementById('reviewForm');
  if (reviewForm) {
    reviewForm.addEventListener('submit', handleReviewSubmit);
  }
  
  const cancelEditBtn = document.getElementById('cancelEdit');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEdit);
  }
  
  initializeStarRating();
});

// Make functions globally accessible
window.handleViewDetails = handleViewDetails;
window.closeDetailsModal = closeDetailsModal;
window.clearFilters = clearFilters;
window.editReview = editReview;
window.deleteReview = deleteReview;
window.loadReviews = loadReviews;
window.resetReviewForm = resetReviewForm;

// Format the date nicely
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';
  
  // Check if the date is in the current year
  const now = new Date();
  const isCurrentYear = date.getFullYear() === now.getFullYear();
  
  const options = isCurrentYear ? 
    { month: 'short', day: 'numeric' } : 
    { month: 'short', day: 'numeric', year: 'numeric' };
    
  return date.toLocaleDateString('en-US', options);
}

// Load restaurant map
function loadMap(restaurant) {
  // Check if we have coordinates
  if (restaurant.lat && restaurant.lon) {
    if (mapInstance) mapInstance.remove();
    
    mapInstance = L.map('map').setView([restaurant.lat, restaurant.lon], 15);
    
    // Use a more modern map tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(mapInstance);
    
    // Add a stylish marker with popup
    const marker = L.marker([restaurant.lat, restaurant.lon]).addTo(mapInstance);
    
    // Create a custom popup with restaurant info
    const popupContent = `
      <div class="text-center p-2">
        <div class="font-medium">${restaurant.name}</div>
        <div class="text-sm text-gray-600">${restaurant.address}</div>
      </div>
    `;
    
    marker.bindPopup(popupContent).openPopup();
  } else {
    // Show a placeholder if no map data
    document.getElementById('map').innerHTML = `
      <div class="flex items-center justify-center h-full bg-gray-100 rounded-lg">
        <div class="text-center p-6">
          <i class="fas fa-map-marked-alt text-gray-400 text-3xl mb-2"></i>
          <p class="text-gray-500">Map location unavailable</p>
        </div>
      </div>
    `;
  }
}

// Function to update review form visibility based on login status
function updateReviewFormVisibility() {
  const reviewFormContainer = document.getElementById('reviewFormContainer');
  
  if (currentUser) {
    reviewFormContainer.classList.remove('hidden');
    
    // Pre-fill the reviewer name if available from user profile
    const reviewerNameInput = document.getElementById('reviewerName');
    if (reviewerNameInput && currentUser.user_metadata && currentUser.user_metadata.name) {
      reviewerNameInput.value = currentUser.user_metadata.name;
    } else if (reviewerNameInput && currentUser.email) {
      // Use email as fallback (or first part of email)
      const emailParts = currentUser.email.split('@');
      reviewerNameInput.value = emailParts[0];
    }
  } else {
    reviewFormContainer.classList.add('hidden');
  }
}

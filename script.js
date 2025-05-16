// Initialize Supabase client
const SUPABASE_URL = 'https://ierqbfleikjernllbpvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllcnFiZmxlaWtqZXJubGxicHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4Mzk1MDIsImV4cCI6MjA2MjQxNTUwMn0.YL-JeNy_rKXw_hAlVHkJxnoIutNDSmF9xNcz8RZwr8s';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let mapInstance = null;
let currentFilters = {};

// Cuisine emoji mapping
const cuisineEmojis = {
  'American': '🍔',
  'Chinese': '🥡',
  'Pizza': '🍕',
  'Italian': '🍝',
  'Mexican': '🌮',
  'Japanese': '🍣',
  'Thai': '🍜',
  'Indian': '🍛',
  'Korean': '🍲',
  'Greek': '🥙',
  'French': '🥖',
  'Mediterranean': '🫒',
  'Middle Eastern': '🧆',
  'Caribbean': '🌴',
  'Vietnamese': '🍜',
  'Donuts': '🍩',
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
  'Bakery Products/Desserts': '🍰',
  'Sandwiches': '🥪',
  'Vegetarian': '🥗',
  'Vegan': '🥬',
  'Seafood': '🦞',
  
  // Fallback for any other cuisine
  'Other': '🍴'
};

// Add loading state
function setLoading(isLoading) {
  const grid = document.getElementById('restaurantGrid');
  if (isLoading) {
    grid.innerHTML = `
      ${Array(6).fill().map(() => `
        <div class="skeleton-card">
          <div class="flex justify-between items-start mb-4">
            <div class="skeleton-line title mb-2"></div>
            <div class="skeleton-line short" style="width: 60px; height: 24px; border-radius: 9999px;"></div>
          </div>
          <div class="space-y-2 mb-4">
            <div class="skeleton-line medium"></div>
            <div class="skeleton-line long"></div>
            <div class="skeleton-line medium"></div>
          </div>
          <div class="skeleton-line" style="height: 38px; margin-top: 16px;"></div>
        </div>
      `).join('')}
    `;
    grid.classList.add('loading');
  } else {
    grid.classList.remove('loading');
  }
}

async function fetchRestaurants(filters = {}) {
  setLoading(true);
  
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
    
    renderRestaurants(data);
  } catch (err) {
    console.error('Error fetching restaurants:', err);
    showNotification('An error occurred while fetching restaurants', 'error');
  } finally {
    setLoading(false);
  }
}

function renderRestaurants(restaurants) {
  const grid = document.getElementById('restaurantGrid');
  grid.innerHTML = '';
  
  if (!restaurants || restaurants.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full empty-state">
        <div class="empty-state-icon">
          <i class="fas fa-utensils"></i>
        </div>
        <h3 class="text-xl font-semibold mb-2">No restaurants found</h3>
        <p class="text-gray-500 mb-4">Try adjusting your filters or search terms</p>
        <button onclick="clearFilters()" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md transition-colors">
          <i class="fas fa-sync-alt mr-2"></i>Clear Filters
        </button>
      </div>
    `;
    return;
  }

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
    
    const card = document.createElement('div');
    card.className = 'card hover:shadow-lg transition-all';
    card.innerHTML = `
      <div class="p-4">
        <div class="flex justify-between items-start mb-3">
          <h3 class="text-lg font-semibold text-gray-900 line-clamp-2">${restaurant.name}</h3>
          <div class="flex items-center">
            <span class="grade-badge ${gradeClass} ml-2 flex-shrink-0">
              <span class="grade-emoji">${gradeEmoji}</span>${restaurant.grade || 'N/A'}
            </span>
          </div>
        </div>
        <div class="mb-3 text-sm text-gray-600">
          <div class="flex items-start mb-2">
            <span class="card-icon flex-shrink-0 mt-1"><i class="fas fa-map-marker-alt"></i></span>
            <span class="line-clamp-1">${restaurant.address || 'No address available'}</span>
          </div>
          <div class="flex items-center mb-2">
            <span class="card-icon flex-shrink-0"><i class="fas fa-utensils"></i></span>
            <span>${cuisineEmoji} ${cuisine}</span>
          </div>
          <div class="flex items-center mb-2">
            <span class="card-icon flex-shrink-0"><i class="fas fa-map-marked-alt"></i></span>
            <span>${restaurant.borough || 'NYC'}</span>
          </div>
          <div class="flex items-center">
            <span class="card-icon flex-shrink-0"><i class="fas fa-calendar-alt"></i></span>
            <span>Last Inspection: ${formatDate(restaurant.inspection_date)}</span>
          </div>
        </div>
        <button 
          onclick="handleViewDetails(${restaurant.id})" 
          class="btn-primary w-full flex justify-center items-center mt-4 py-2"
        >
          <i class="fas fa-info-circle mr-2"></i>
          <span>View Details</span>
        </button>
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
  
  // Reset owner dashboard view if it exists
  returnToCustomerView();
  
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
    loadRestaurantDetails(restaurant);

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
  const title = document.getElementById('modalRestaurantTitle');
  const address = document.getElementById('modalRestaurantAddress');
  const details = document.getElementById('modalRestaurantDetails');
  const restaurantIdInput = document.getElementById('modalRestaurantId');
  
  title.innerHTML = `
    ${restaurant.name}
    <span class="owner-link text-sm ml-2" onclick="promptOwnerPassword(${restaurant.id})">
      Owner? Click here
    </span>
  `;
  
  address.innerHTML = `<i class="fas fa-map-marker-alt text-gray-400 mr-2"></i>${restaurant.address || 'No address available'}`;
  
  // Format details with icons
  const grade = restaurant.grade || 'N/A';
  const gradeClass = `grade-${grade}`;
  const gradeEmoji = {'A': '🏆', 'B': '👍', 'C': '⚠️', 'N/A': '❓', 'PENDING': '⏳'}[grade] || '❓';
  
  // Use cuisine with fallback options
  const cuisine = restaurant.cuisine || restaurant.cuisine_type || 'Other';
  const cuisineEmoji = cuisineEmojis[cuisine] || '🍴';
  
  details.innerHTML = `
    <div class="flex flex-wrap gap-2 mt-3">
      <span class="grade-badge ${gradeClass}">
        <span class="grade-emoji">${gradeEmoji}</span>${grade}
      </span>
      <span class="tag">
        <i class="fas fa-utensils"></i>${cuisine}
      </span>
      <span class="tag">
        <i class="fas fa-map-marked-alt"></i>${restaurant.borough || 'NYC'}
      </span>
      <span class="tag">
        <i class="fas fa-calendar-alt"></i>${formatDate(restaurant.inspection_date)}
      </span>
      ${restaurant.critical_flag ? `
        <span class="tag" style="background-color: var(--danger-light); color: var(--danger); border-color: var(--danger-light);">
          <i class="fas fa-exclamation-triangle"></i>Critical Violation
        </span>
      ` : ''}
    </div>
  `;
  
  restaurantIdInput.value = restaurant.id;
  
  // Load map
  loadMap(restaurant);

  // Load reviews for this restaurant
  loadReviews(restaurant.id);
}

// Clear restaurant details from the modal
function clearRestaurantDetails() {
  document.getElementById('modalRestaurantTitle').textContent = '';
  document.getElementById('modalRestaurantAddress').textContent = '';
  document.getElementById('modalRestaurantDetails').textContent = '';
  document.getElementById('reviewsList').innerHTML = '';
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
}

// Close the details modal
function closeDetailsModal() {
  const modal = document.getElementById('detailsModal');
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  clearRestaurantDetails();
  
  // Reset owner dashboard view
  const ownerReportSection = document.getElementById('ownerReportSection');
  if (ownerReportSection) {
    ownerReportSection.remove();
  }
  
  // Make sure reviews section is visible for next time
  const reviewsSection = document.querySelector('#detailsModal .border-t');
  if (reviewsSection) {
    reviewsSection.classList.remove('hidden');
  }
  
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
    
    // Track logout event if Vercel Analytics is available
    if (window.trackEvent) {
      window.trackEvent('user_logout', { status: 'success' });
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
    let actionType = 'create';
    
    if (reviewId) {
      actionType = 'update';
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

    // Track review submission if Vercel Analytics is available
    if (window.trackEvent) {
      window.trackEvent('review_submitted', { 
        action: actionType,
        restaurant_id: restaurantId,
        rating: rating
      });
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

// Function to download filtered restaurants as CSV
async function downloadFilteredResultsCSV() {
  try {
    // Get the currently displayed restaurants from the grid
    const restaurantGrid = document.getElementById('restaurantGrid');
    const restaurantCards = restaurantGrid.querySelectorAll('.card');
    
    // If there are no restaurants, show a notification and return
    if (restaurantCards.length === 0) {
      showNotification('No restaurants to export. Try removing filters or performing a search first.', 'error');
      return;
    }
    
    // Show a loading notification
    const loadingNotification = showNotification('Preparing CSV export...', 'success', 0);
    
    // Create CSV header
    let csvContent = [
      ['Restaurant Name', 'Address', 'Phone Number', 'Cuisine', 'Grade']
    ];
    
    // Collect restaurant IDs from the cards
    const restaurantIds = [];
    restaurantCards.forEach(card => {
      try {
        // Extract restaurant ID from the View Details button
        const viewDetailsBtn = card.querySelector('button');
        const onClickAttr = viewDetailsBtn ? viewDetailsBtn.getAttribute('onclick') : '';
        const restaurantIdMatch = onClickAttr ? onClickAttr.match(/handleViewDetails\((\d+)\)/) : null;
        const restaurantId = restaurantIdMatch ? parseInt(restaurantIdMatch[1], 10) : null;
        
        if (restaurantId) {
          restaurantIds.push(restaurantId);
        }
      } catch (err) {
        console.error('Error extracting restaurant ID:', err);
      }
    });
    
    // Fetch all restaurant data from Supabase
    const { data: restaurants, error } = await supabase
      .from('restaurants')
      .select('*')
      .in('id', restaurantIds);
      
    if (error) {
      console.error('Error fetching restaurant details:', error);
      // Continue with basic info from the cards if fetch fails
    }
    
    // Create a map of restaurant data for quick lookup
    const restaurantMap = {};
    if (restaurants && restaurants.length > 0) {
      restaurants.forEach(restaurant => {
        restaurantMap[restaurant.id] = restaurant;
      });
    }
    
    // Process each restaurant card
    restaurantCards.forEach(card => {
      try {
        // Extract basic info from the card
        const name = card.querySelector('h3').innerText.trim();
        
        // Get restaurant ID
        const viewDetailsBtn = card.querySelector('button');
        const onClickAttr = viewDetailsBtn ? viewDetailsBtn.getAttribute('onclick') : '';
        const restaurantIdMatch = onClickAttr ? onClickAttr.match(/handleViewDetails\((\d+)\)/) : null;
        const restaurantId = restaurantIdMatch ? parseInt(restaurantIdMatch[1], 10) : null;
        
        // Try to get detailed info from the database
        let address = 'N/A';
        let phone = 'N/A';
        let cuisine = 'N/A';
        let grade = 'N/A';
        
        // Get data from map if available
        if (restaurantId && restaurantMap[restaurantId]) {
          const restaurant = restaurantMap[restaurantId];
          address = restaurant.address || 'N/A';
          phone = restaurant.phone || 'N/A';
          cuisine = restaurant.cuisine || restaurant.cuisine_type || 'N/A';
          grade = restaurant.grade || 'N/A';
        } else {
          // Fallback to card data
          // Get address (second sibling of map marker icon)
          const addressElement = card.querySelector('.fa-map-marker-alt').parentNode.nextElementSibling;
          address = addressElement ? addressElement.innerText.trim() : 'N/A';
          
          // Get cuisine (second sibling of utensils icon)
          const cuisineElement = card.querySelector('.fa-utensils').parentNode.nextElementSibling;
          if (cuisineElement) {
            // Remove emoji from cuisine if present (typically first 2 characters)
            cuisine = cuisineElement.innerText.trim();
            if (cuisine.indexOf(' ') > 0) {
              cuisine = cuisine.substring(cuisine.indexOf(' ') + 1); // Remove emoji and space
            }
          }
          
          // Get grade badge
          const gradeBadge = card.querySelector('.grade-badge');
          grade = gradeBadge ? gradeBadge.innerText.trim().replace(/[🏆👍⚠️❓⏳]/g, '').trim() : 'N/A';
        }
        
        // Add this restaurant to the CSV data
        csvContent.push([name, address, phone, cuisine, grade]);
      } catch (err) {
        console.error('Error processing restaurant card:', err);
        // Continue with next card
      }
    });
    
    // Remove the loading notification
    if (loadingNotification) {
      loadingNotification.remove();
    }
    
    // Convert arrays to CSV string
    const csvString = csvContent.map(row => row.map(cell => {
      // Handle cells with commas, quotes, etc.
      const cellValue = String(cell).replace(/"/g, '""');
      return `"${cellValue}"`;
    }).join(',')).join('\n');
    
    // Create a download link
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set up the link
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `SafeBite_NYC_Restaurants_${date}.csv`);
    link.style.visibility = 'hidden';
    
    // Append to document, trigger the download, and cleanup
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Track download if analytics is available
    if (window.trackEvent) {
      window.trackEvent('filtered_results_download', { 
        count: restaurantCards.length,
        filters: JSON.stringify(currentFilters || {})
      });
    }
    
    // Show a success notification
    showNotification(`${restaurantCards.length} restaurants exported successfully`, 'success');
  } catch (err) {
    console.error('Error creating CSV export:', err);
    showNotification('Error creating CSV export', 'error');
  }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  fetchRestaurants();
  loadUser();
  
  // Filter handling
  const applyFiltersBtn = document.getElementById('applyFilters');
  if (applyFiltersBtn) {
    applyFiltersBtn.addEventListener('click', () => {
      const filters = {
        grade: document.getElementById('gradeFilter').value,
        borough: document.getElementById('boroughFilter').value,
        cuisine: document.getElementById('cuisineFilter').value,
        search: document.getElementById('searchInput').value.trim()
      };
      currentFilters = filters; // Store current filters for CSV export
      fetchRestaurants(filters);
    });
  }
  
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const applyBtn = document.getElementById('applyFilters');
        if (applyBtn) applyBtn.click();
      }
    });
  }
  
  // CSV download button
  const downloadBtn = document.getElementById('downloadResultsCSV');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      downloadFilteredResultsCSV();
    });
  }
  
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
  
  // Add scroll effect to filter container
  const filterContainer = document.querySelector('.filter-container');
  if (filterContainer) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 10) {
        filterContainer.classList.add('scrolled');
      } else {
        filterContainer.classList.remove('scrolled');
      }
    });
  }
  
  // Initialize favorite icons when viewing details
  window.handleViewDetails = handleViewDetails;
  window.closeDetailsModal = closeDetailsModal;
  window.clearFilters = clearFilters;
  window.updateStars = updateStars;
  window.handleReviewSubmit = handleReviewSubmit;
  window.cancelEdit = cancelEdit;
  window.logout = logout;
  window.editReview = editReview;
  window.deleteReview = deleteReview;
  window.promptOwnerPassword = promptOwnerPassword;
  window.returnToCustomerView = returnToCustomerView;
  window.updateRestaurantInfo = updateRestaurantInfo;
  window.downloadReportCSV = downloadReportCSV;
  window.downloadFilteredResultsCSV = downloadFilteredResultsCSV;
});

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

// Owner report functionality
function promptOwnerPassword(restaurantId) {
  const password = prompt('Please enter the owner password:');
  
  if (password === 'admin') {
    // Track owner login if Vercel Analytics is available
    if (window.trackEvent) {
      window.trackEvent('owner_dashboard_view', { restaurant_id: restaurantId });
    }
    
    // Hide reviews section
    document.querySelector('#detailsModal .border-t').classList.add('hidden');
    
    // Load owner details in the same modal
    loadOwnerReport(restaurantId);
  } else {
    alert('Incorrect password');
  }
}

async function loadOwnerReport(restaurantId) {
  try {
    // Get restaurant ID from the hidden input
    if (!restaurantId) {
      restaurantId = parseInt(document.getElementById('modalRestaurantId').value, 10);
    }
    
    // First, remove any existing owner report sections to prevent duplicates
    const existingReportSection = document.getElementById('ownerReportSection');
    if (existingReportSection) {
      existingReportSection.remove();
    }
    
    // Set loading state for the modal
    const detailsContainer = document.getElementById('detailsModal').querySelector('.p-6');
    
    // Create owner report section
    const ownerReportSection = document.createElement('div');
    ownerReportSection.id = 'ownerReportSection';
    ownerReportSection.className = 'border-t border-gray-200 pt-6';
    ownerReportSection.innerHTML = `
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-lg font-semibold text-gray-900">
          <i class="fas fa-chart-bar mr-2 text-blue-500"></i>Owner Dashboard
        </h3>
        <button onclick="returnToCustomerView()" class="text-sm text-gray-500 hover:text-gray-700 flex items-center">
          <i class="fas fa-arrow-left mr-1"></i>Back to customer view
        </button>
      </div>
      <div class="flex justify-center items-center py-8">
        <i class="fas fa-spinner fa-spin text-indigo-500 text-3xl"></i>
      </div>
    `;
    
    // Add the owner report section
    detailsContainer.appendChild(ownerReportSection);
    
    // Fetch restaurant details if not already fetched
    let restaurant;
    if (restaurantId) {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', parseInt(restaurantId, 10))
        .single();
        
      if (error) throw error;
      restaurant = data;
    }
    
    // Fetch review count
    const { count: reviewCount, error: reviewError } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', parseInt(restaurantId, 10));
      
    if (reviewError) throw reviewError;
    
    // Get average rating
    const { data: ratingData, error: ratingError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('restaurant_id', parseInt(restaurantId, 10));
      
    if (ratingError) throw ratingError;
    
    let averageRating = 0;
    if (ratingData && ratingData.length > 0) {
      const sum = ratingData.reduce((acc, review) => acc + review.rating, 0);
      averageRating = (sum / ratingData.length).toFixed(1);
    }
    
    // Get the most recent review date
    const { data: latestReview, error: latestError } = await supabase
      .from('reviews')
      .select('created_at')
      .eq('restaurant_id', parseInt(restaurantId, 10))
      .order('created_at', { ascending: false })
      .limit(1);
      
    const lastReviewDate = latestReview && latestReview.length > 0 
      ? formatDate(latestReview[0].created_at)
      : 'N/A';
    
    // Get recent reviews
    const { data: recentReviews, error: recentError } = await supabase
      .from('reviews')
      .select('rating, comment, created_at')
      .eq('restaurant_id', parseInt(restaurantId, 10))
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (recentError) throw recentError;
    
    // Build recent reviews HTML
    let recentReviewsHtml = '';
    if (recentReviews && recentReviews.length > 0) {
      recentReviewsHtml = `
        <h4 class="font-medium text-gray-700 mb-3">Recent Reviews</h4>
        <div class="space-y-4 recent-reviews-container">
          ${recentReviews.map(review => `
            <div class="border rounded-md p-4 bg-gray-50">
              <div class="flex justify-between mb-2">
                <div class="text-sm text-gray-500">${formatDate(review.created_at)}</div>
                <div class="text-yellow-500">
                  ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}
                </div>
              </div>
              <p class="text-gray-700">${review.comment}</p>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      recentReviewsHtml = `
        <div class="text-center py-6 text-gray-500 bg-gray-50 rounded-md">
          <p>No reviews available</p>
        </div>
      `;
    }
    
    // Get cuisine options for dropdown
    const cuisineOptions = [
      'American', 'Chinese', 'Italian', 'Japanese', 'Indian', 'Korean', 
      'Thai', 'Mexican', 'Greek', 'French', 'Middle Eastern', 'Caribbean', 
      'Vietnamese', 'Bakery Products/Desserts', 'Sandwiches', 'Pizza', 
      'Seafood', 'Vegetarian', 'Vegan'
    ].map(cuisine => {
      const selected = (restaurant.cuisine === cuisine || restaurant.cuisine_type === cuisine) 
        ? 'selected' 
        : '';
      return `<option value="${cuisine}" ${selected}>${cuisine}</option>`;
    }).join('');
    
    // Update the owner report section with restaurant details
    ownerReportSection.innerHTML = `
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold text-gray-900">
          <i class="fas fa-chart-bar mr-2 text-blue-500"></i>Owner Dashboard
        </h3>
        <button onclick="returnToCustomerView()" class="text-sm text-gray-500 hover:text-gray-700 flex items-center">
          <i class="fas fa-arrow-left mr-1"></i>Back to customer view
        </button>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div class="bg-white rounded-lg border p-5 mb-6">
            <h4 class="font-medium text-gray-700 mb-4">Restaurant Stats</h4>
            
            <div class="grid grid-cols-1 gap-4 mb-4">
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Total Reviews</span>
                <span class="text-lg font-medium">${reviewCount}</span>
              </div>
              
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Average Rating</span>
                <span class="text-lg font-medium text-yellow-500">${averageRating} / 5</span>
              </div>
              
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Latest Review</span>
                <span class="text-sm">${lastReviewDate}</span>
              </div>
              
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Current Grade</span>
                <span class="grade-badge ${getGradeColorClass(restaurant.grade)}">${restaurant.grade || 'N/A'}</span>
              </div>
            </div>
            
            <div class="border-t pt-4 mt-2">
              <div class="p-4 rounded-md ${getGradeColorClass(restaurant.grade)}">
                <p class="text-sm">${getGradeMessage(restaurant.grade)}</p>
              </div>
            </div>
          </div>
          
          ${recentReviewsHtml}
        </div>
        
        <div>
          <div class="bg-white rounded-lg border p-5 mb-6">
            <h4 class="font-medium text-gray-700 mb-4">Update Restaurant Info</h4>
            
            <div class="mb-4">
              <label for="restaurantAddress" class="block font-medium text-gray-700 mb-2">Address</label>
              <input type="text" id="restaurantAddress" class="w-full px-3 py-2 border rounded-md" 
                    value="${restaurant.address || ''}" />
            </div>
            
            <div class="mb-4">
              <label for="restaurantCuisine" class="block font-medium text-gray-700 mb-2">Cuisine</label>
              <select id="restaurantCuisine" class="w-full px-3 py-2 border rounded-md">
                ${cuisineOptions}
              </select>
            </div>
            
            <button onclick="updateRestaurantInfo(${restaurant.id})" class="btn-primary w-full py-2 mt-4">
              <i class="fas fa-save mr-2"></i>Save Changes
            </button>
          </div>
          
          <div class="bg-white rounded-lg border p-5">
            <h4 class="font-medium text-gray-700 mb-4">Report</h4>
            <p class="text-sm text-gray-600 mb-4">
              Download a comprehensive report with all restaurant statistics and reviews in CSV format.
            </p>
            <button onclick="downloadReportCSV(${restaurant.id})" class="btn-secondary w-full py-2">
              <i class="fas fa-download mr-2"></i>Download Report (CSV)
            </button>
          </div>
        </div>
      </div>
    `;
    
  } catch (err) {
    console.error('Error loading owner report:', err);
    showNotification('Error loading owner report', 'error');
  }
}

function returnToCustomerView() {
  // Remove owner report section
  const ownerReportSection = document.getElementById('ownerReportSection');
  if (ownerReportSection) {
    ownerReportSection.remove();
  }
  
  // Show reviews section again
  const reviewsSection = document.querySelector('#detailsModal .border-t');
  if (reviewsSection) {
    reviewsSection.classList.remove('hidden');
  }
}

function getGradeMessage(grade) {
  switch (grade) {
    case 'A':
      return "Great job! Your restaurant is maintaining excellent health standards.";
    case 'B':
      return "Focus on improving cleanliness and food handling procedures to achieve an A grade.";
    case 'C':
      return "Review kitchen hygiene practices immediately. Schedule a follow-up inspection.";
    default:
      return "No grade information available. Please schedule an inspection.";
  }
}

function getGradeColorClass(grade) {
  switch (grade) {
    case 'A':
      return "bg-green-50 text-green-800";
    case 'B':
      return "bg-yellow-50 text-yellow-800";
    case 'C':
      return "bg-red-50 text-red-800";
    default:
      return "bg-gray-50 text-gray-800";
  }
}

async function updateRestaurantInfo(restaurantId) {
  const newAddress = document.getElementById('restaurantAddress').value.trim();
  const newCuisine = document.getElementById('restaurantCuisine').value;
  
  if (!newAddress) {
    showNotification('Address cannot be empty', 'error');
    return;
  }
  
  try {
    const { error } = await supabase
      .from('restaurants')
      .update({ 
        address: newAddress,
        cuisine: newCuisine 
      })
      .eq('id', restaurantId);
      
    if (error) {
      throw error;
    }
    
    // Track restaurant update if Vercel Analytics is available
    if (window.trackEvent) {
      window.trackEvent('restaurant_updated', { 
        restaurant_id: restaurantId,
        cuisine: newCuisine
      });
    }
    
    showNotification('Restaurant information updated successfully', 'success');
    
    // Update the information in the DOM if the restaurant card is visible
    document.querySelectorAll(`.card`).forEach(card => {
      if (card.innerHTML.includes(`handleViewDetails(${restaurantId})`)) {
        const addressSpan = card.querySelector('.fa-map-marker-alt').parentNode.nextElementSibling;
        addressSpan.textContent = newAddress;
        
        const cuisineSpan = card.querySelector('.fa-utensils').parentNode.nextElementSibling;
        const cuisineEmoji = cuisineEmojis[newCuisine] || '🍴';
        cuisineSpan.innerHTML = `${cuisineEmoji} ${newCuisine}`;
      }
    });
    
  } catch (err) {
    console.error('Error updating restaurant information:', err);
    showNotification('Error updating restaurant information', 'error');
  }
}

async function downloadReportCSV(restaurantId) {
  try {
    // Fetch restaurant details
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', parseInt(restaurantId, 10))
      .single();
      
    if (error) throw error;
    
    // Fetch review count
    const { count: reviewCount, error: reviewError } = await supabase
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', parseInt(restaurantId, 10));
      
    if (reviewError) throw reviewError;
    
    // Get average rating
    const { data: ratingData, error: ratingError } = await supabase
      .from('reviews')
      .select('rating')
      .eq('restaurant_id', parseInt(restaurantId, 10));
      
    if (ratingError) throw ratingError;
    
    let averageRating = 0;
    if (ratingData && ratingData.length > 0) {
      const sum = ratingData.reduce((acc, review) => acc + review.rating, 0);
      averageRating = (sum / ratingData.length).toFixed(1);
    }
    
    // Get the most recent review date
    const { data: latestReview, error: latestError } = await supabase
      .from('reviews')
      .select('created_at')
      .eq('restaurant_id', parseInt(restaurantId, 10))
      .order('created_at', { ascending: false })
      .limit(1);
      
    const lastReviewDate = latestReview && latestReview.length > 0 
      ? formatDate(latestReview[0].created_at)
      : 'N/A';
    
    // Get improvement insights based on grade
    const improvementInsights = getGradeMessage(restaurant.grade);
    
    // Get recent reviews for the second part of the report
    const { data: recentReviews, error: recentError } = await supabase
      .from('reviews')
      .select('rating, comment, created_at')
      .eq('restaurant_id', parseInt(restaurantId, 10))
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (recentError) throw recentError;
    
    // Get phone number from restaurant data with fallback
    const phoneNumber = restaurant.phone || '(N/A)';
    
    // Format current date for report generation date
    const currentDate = formatDate(new Date());
    
    // Format inspection date
    const inspectionDate = formatDate(restaurant.inspection_date) || 'N/A';
    
    // Format address with fallback
    const address = restaurant.address || 'N/A';
    
    // Create CSV content
    let csvContent = [
      ['Restaurant Name', restaurant.name],
      ['Report Generated', currentDate],
      ['Current Grade', restaurant.grade || 'N/A'],
      ['Inspection Date', inspectionDate],
      ['Total Reviews', reviewCount],
      ['Average Rating', averageRating],
      ['Last Review Date', lastReviewDate],
      ['Address', address],
      ['Phone', phoneNumber],
      ['Improvement Insights', `"${improvementInsights}"`],
      [''],
      ['Recent Reviews'],
      ['Date', 'Rating', 'Comment']
    ];
    
    // Add recent reviews to the CSV content
    if (recentReviews && recentReviews.length > 0) {
      recentReviews.forEach(review => {
        csvContent.push([
          formatDate(review.created_at),
          review.rating,
          `"${review.comment.replace(/"/g, '""')}"`
        ]);
      });
    } else {
      csvContent.push(['N/A', 'N/A', 'No reviews available']);
    }
    
    // Convert arrays to CSV format
    const formattedCSV = csvContent.map(row => row.join(',')).join('\n');
    
    // Create downloadable file
    const blob = new Blob([formattedCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set link properties
    link.setAttribute('href', url);
    link.setAttribute('download', `${restaurant.name.replace(/\s+/g, '_')}_Report_${currentDate.replace(/\//g, '-')}.csv`);
    link.style.visibility = 'hidden';
    
    // Add to DOM, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Report downloaded successfully', 'success');
    
    // Track report download if Vercel Analytics is available
    if (window.trackEvent) {
      window.trackEvent('report_downloaded', { 
        restaurant_id: restaurantId,
        restaurant_name: restaurant.name
      });
    }
    
  } catch (err) {
    console.error('Error downloading report:', err);
    showNotification('Error generating report', 'error');
  }
}

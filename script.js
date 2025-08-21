
class MealService {
    constructor() {
        this.apiBaseUrl = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
        this.schoolCode = {
            ATPT_OFCDC_SC_CODE: 'J10',
            SD_SCHUL_CODE: '7530520'
        };
        
        this.favorites = this.loadFavorites();
        
        this.initializeElements();
        this.bindEvents();
        this.setDefaultDate();
        this.displayFavorites();
    }
    
    initializeElements() {
        this.dateInput = document.getElementById('meal-date');
        this.searchBtn = document.getElementById('search-btn');
        this.todayBtn = document.getElementById('today-btn');
        this.loadingElement = document.getElementById('loading');
        this.mealInfo = document.getElementById('meal-info');
        this.mealDateDisplay = document.getElementById('meal-date-display');
        this.mealContent = document.getElementById('meal-content');
        this.errorMessage = document.getElementById('error-message');
    }
    
    bindEvents() {
        this.searchBtn.addEventListener('click', () => this.searchMealInfo());
        this.todayBtn.addEventListener('click', () => this.searchTodayMeal());
        this.dateInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchMealInfo();
            }
        });
    }
    
    setDefaultDate() {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        this.dateInput.value = formattedDate;
    }
    
    searchTodayMeal() {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        this.dateInput.value = formattedDate;
        this.searchMealInfo();
    }
    
    async searchMealInfo() {
        const selectedDate = this.dateInput.value;
        
        if (!selectedDate) {
            this.showError('날짜를 선택해주세요.');
            return;
        }
        
        const formattedDate = selectedDate.replace(/-/g, '');
        
        this.showLoading(true);
        this.hideError();
        
        try {
            const mealData = await this.fetchMealData(formattedDate);
            this.displayMealInfo(mealData, selectedDate);
        } catch (error) {
            console.error('Error fetching meal data:', error);
            this.showError('급식정보를 불러오는데 실패했습니다. 해당 날짜에 급식이 없거나 주말/공휴일일 수 있습니다.');
        } finally {
            this.showLoading(false);
        }
    }
    
    async fetchMealData(date) {
        const url = `${this.apiBaseUrl}?ATPT_OFCDC_SC_CODE=${this.schoolCode.ATPT_OFCDC_SC_CODE}&SD_SCHUL_CODE=${this.schoolCode.SD_SCHUL_CODE}&MLSV_YMD=${date}&Type=xml`;
        
        // CORS 문제를 해결하기 위해 다른 프록시 서버 사용
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${url}`;
        
        try {
            const response = await fetch(proxyUrl, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const xmlText = await response.text();
            return this.parseXML(xmlText);
        } catch (error) {
            // 백업 프록시 시도
            const backupProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const backupResponse = await fetch(backupProxyUrl);
            
            if (!backupResponse.ok) {
                throw new Error(`HTTP error! status: ${backupResponse.status}`);
            }
            
            const xmlText = await backupResponse.text();
            return this.parseXML(xmlText);
        }
    }
    
    parseXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // 에러 체크
        const errorElement = xmlDoc.querySelector('RESULT');
        if (errorElement) {
            const errorCode = errorElement.querySelector('CODE')?.textContent;
            if (errorCode !== 'INFO-000') {
                throw new Error('해당 날짜에 급식정보가 없습니다.');
            }
        }
        
        const mealItems = xmlDoc.querySelectorAll('row');
        
        if (mealItems.length === 0) {
            throw new Error('해당 날짜에 급식정보가 없습니다.');
        }
        
        const meals = [];
        mealItems.forEach(item => {
            const mealType = item.querySelector('MMEAL_SC_NM')?.textContent || '';
            const dishName = item.querySelector('DDISH_NM')?.textContent || '';
            const calorie = item.querySelector('CAL_INFO')?.textContent || '';
            const nutrition = item.querySelector('NTR_INFO')?.textContent || '';
            
            if (mealType && dishName) {
                meals.push({
                    type: mealType,
                    dishes: this.parseDishes(dishName),
                    calorie: calorie,
                    nutrition: this.parseNutrition(nutrition)
                });
            }
        });
        
        return meals;
    }
    
    parseDishes(dishText) {
        // <br/> 태그와 숫자 제거, 알레르기 정보 제거
        return dishText
            .replace(/<br\s*\/?>/gi, '\n')
            .split('\n')
            .map(dish => dish.replace(/\d+\./g, '').replace(/\([^)]*\)/g, '').trim())
            .filter(dish => dish.length > 0);
    }
    
    parseNutrition(nutritionText) {
        if (!nutritionText) return null;
        
        const nutrition = {
            carbs: '',
            protein: '',
            fat: '',
            vitamins: '',
            minerals: ''
        };
        
        // 영양정보 파싱 개선 - 다양한 형식 지원
        // 탄수화물 파싱
        const carbsMatches = [
            nutritionText.match(/탄수화물[:\s]*([0-9.]+)/),
            nutritionText.match(/탄수화물\(g\)[:\s]*([0-9.]+)/),
            nutritionText.match(/탄수화물\s*:\s*([0-9.]+)/),
            nutritionText.match(/탄수화물\s+([0-9.]+)g?/)
        ];
        const carbsMatch = carbsMatches.find(match => match !== null);
        
        // 단백질 파싱
        const proteinMatches = [
            nutritionText.match(/단백질[:\s]*([0-9.]+)/),
            nutritionText.match(/단백질\(g\)[:\s]*([0-9.]+)/),
            nutritionText.match(/단백질\s*:\s*([0-9.]+)/),
            nutritionText.match(/단백질\s+([0-9.]+)g?/)
        ];
        const proteinMatch = proteinMatches.find(match => match !== null);
        
        // 지방 파싱
        const fatMatches = [
            nutritionText.match(/지방[:\s]*([0-9.]+)/),
            nutritionText.match(/지방\(g\)[:\s]*([0-9.]+)/),
            nutritionText.match(/지방\s*:\s*([0-9.]+)/),
            nutritionText.match(/지방\s+([0-9.]+)g?/)
        ];
        const fatMatch = fatMatches.find(match => match !== null);
        
        // 비타민 파싱
        const vitaminAMatch = nutritionText.match(/비타민A[:\s]*([0-9.]+)/);
        const vitaminCMatch = nutritionText.match(/비타민C[:\s]*([0-9.]+)/);
        
        // 미네랄 파싱
        const calciumMatch = nutritionText.match(/칼슘[:\s]*([0-9.]+)/);
        const ironMatch = nutritionText.match(/철분[:\s]*([0-9.]+)/);
        const sodiumMatch = nutritionText.match(/나트륨[:\s]*([0-9.]+)/);
        
        // 결과 할당
        if (carbsMatch) nutrition.carbs = parseFloat(carbsMatch[1]).toFixed(1) + 'g';
        if (proteinMatch) nutrition.protein = parseFloat(proteinMatch[1]).toFixed(1) + 'g';
        if (fatMatch) nutrition.fat = parseFloat(fatMatch[1]).toFixed(1) + 'g';
        
        // 비타민 정보
        const vitamins = [];
        if (vitaminAMatch) vitamins.push(`비타민A ${vitaminAMatch[1]}μg`);
        if (vitaminCMatch) vitamins.push(`비타민C ${vitaminCMatch[1]}mg`);
        if (vitamins.length > 0) nutrition.vitamins = vitamins.join(', ');
        
        // 미네랄 정보
        const minerals = [];
        if (calciumMatch) minerals.push(`칼슘 ${calciumMatch[1]}mg`);
        if (ironMatch) minerals.push(`철분 ${ironMatch[1]}mg`);
        if (sodiumMatch) minerals.push(`나트륨 ${sodiumMatch[1]}mg`);
        if (minerals.length > 0) nutrition.minerals = minerals.join(', ');
        
        return nutrition;
    }
    
    displayMealInfo(meals, date) {
        const formattedDate = this.formatDisplayDate(date);
        this.mealDateDisplay.textContent = `${formattedDate} 급식정보`;
        
        if (meals.length === 0) {
            this.mealContent.innerHTML = '<p class="no-data">해당 날짜에 급식정보가 없습니다.</p>';
            return;
        }
        
        let html = '';
        meals.forEach(meal => {
            html += `
                <div class="meal-menu">
                    <h3>${meal.type}</h3>
                    <ul>
                        ${meal.dishes.map(dish => {
                            const isFavorited = this.favorites.includes(dish);
                            return `
                                <li>
                                    <span class="meal-item-content">${dish}</span>
                                    <button class="heart-button ${isFavorited ? 'favorited' : ''}" 
                                            data-dish="${dish}" 
                                            onclick="mealService.toggleFavorite('${dish.replace(/'/g, "\\'")}')"
                                            title="${isFavorited ? '즐겨찾기 해제' : '즐겨찾기 추가'}">
                                        ${isFavorited ? '❤️' : '🤍'}
                                    </button>
                                </li>
                            `;
                        }).join('')}
                    </ul>
                    ${meal.calorie ? `
                        <div class="calorie-info">
                            <strong>🔥 칼로리: ${meal.calorie}</strong>
                        </div>
                    ` : ''}
                    ${meal.nutrition ? this.renderNutritionInfo(meal.nutrition) : ''}
                </div>
            `;
        });
        
        this.mealContent.innerHTML = html;
    }
    
    renderNutritionInfo(nutrition) {
        const hasNutritionData = nutrition.carbs || nutrition.protein || nutrition.fat || nutrition.vitamins || nutrition.minerals;
        
        if (!hasNutritionData) {
            // 기본 영양정보 표시 (임시 데이터)
            return `
                <div class="nutrition-info">
                    <h4>영양정보</h4>
                    <div class="nutrition-grid">
                        <div class="nutrition-item">
                            <div class="nutrition-label">탄수화물</div>
                            <div class="nutrition-value">정보 없음</div>
                        </div>
                        <div class="nutrition-item">
                            <div class="nutrition-label">단백질</div>
                            <div class="nutrition-value">정보 없음</div>
                        </div>
                        <div class="nutrition-item">
                            <div class="nutrition-label">지방</div>
                            <div class="nutrition-value">정보 없음</div>
                        </div>
                    </div>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 10px; text-align: center;">
                        📝 정확한 영양정보는 학교 급식실에 문의하세요.
                    </p>
                </div>
            `;
        }
        
        return `
            <div class="nutrition-info">
                <h4>영양정보 (100g 기준)</h4>
                <div class="nutrition-grid">
                    <div class="nutrition-item ${nutrition.carbs ? 'has-data' : ''}">
                        <div class="nutrition-label">🍞 탄수화물</div>
                        <div class="nutrition-value">${nutrition.carbs || '정보 없음'}</div>
                    </div>
                    <div class="nutrition-item ${nutrition.protein ? 'has-data' : ''}">
                        <div class="nutrition-label">🥩 단백질</div>
                        <div class="nutrition-value">${nutrition.protein || '정보 없음'}</div>
                    </div>
                    <div class="nutrition-item ${nutrition.fat ? 'has-data' : ''}">
                        <div class="nutrition-label">🥑 지방</div>
                        <div class="nutrition-value">${nutrition.fat || '정보 없음'}</div>
                    </div>
                    ${nutrition.vitamins ? `
                        <div class="nutrition-item has-data">
                            <div class="nutrition-label">🍊 비타민</div>
                            <div class="nutrition-value">${nutrition.vitamins}</div>
                        </div>
                    ` : ''}
                    ${nutrition.minerals ? `
                        <div class="nutrition-item has-data">
                            <div class="nutrition-label">⚡ 미네랄</div>
                            <div class="nutrition-value">${nutrition.minerals}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    formatDisplayDate(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        
        return `${year}년 ${month}월 ${day}일 (${dayOfWeek})`;
    }
    
    showLoading(show) {
        if (show) {
            this.loadingElement.classList.remove('hidden');
            this.mealInfo.style.opacity = '0.5';
        } else {
            this.loadingElement.classList.add('hidden');
            this.mealInfo.style.opacity = '1';
        }
    }
    
    showError(message) {
        this.errorMessage.querySelector('p').textContent = message;
        this.errorMessage.classList.remove('hidden');
    }
    
    hideError() {
        this.errorMessage.classList.add('hidden');
    }
    
    loadFavorites() {
        try {
            const saved = localStorage.getItem('mealFavorites');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('Error loading favorites:', error);
            return [];
        }
    }
    
    saveFavorites() {
        try {
            localStorage.setItem('mealFavorites', JSON.stringify(this.favorites));
        } catch (error) {
            console.error('Error saving favorites:', error);
        }
    }
    
    toggleFavorite(dishName) {
        const index = this.favorites.indexOf(dishName);
        if (index > -1) {
            this.favorites.splice(index, 1);
        } else {
            this.favorites.push(dishName);
        }
        this.saveFavorites();
        this.displayFavorites();
        
        // 현재 표시된 급식정보 업데이트
        const heartButtons = document.querySelectorAll('.heart-button');
        heartButtons.forEach(button => {
            const dishName = button.dataset.dish;
            const isFavorited = this.favorites.includes(dishName);
            button.classList.toggle('favorited', isFavorited);
            button.innerHTML = isFavorited ? '❤️' : '🤍';
        });
    }
    
    displayFavorites() {
        let favoritesHtml = '';
        
        if (this.favorites.length > 0) {
            favoritesHtml = `
                <div class="favorites-section">
                    <h3>내가 좋아하는 메뉴</h3>
                    <ul class="favorites-list">
                        ${this.favorites.map(dish => `
                            <li>
                                <span>${dish}</span>
                                <button class="remove-favorite" onclick="mealService.removeFavorite('${dish}')" title="즐겨찾기 해제">
                                    ✖️
                                </button>
                            </li>
                        `).join('')}
                    </ul>
                </div>
            `;
        }
        
        // 즐겨찾기 섹션을 급식정보 위에 표시
        const existingFavorites = document.querySelector('.favorites-section');
        if (existingFavorites) {
            existingFavorites.remove();
        }
        
        if (favoritesHtml) {
            this.mealInfo.insertAdjacentHTML('beforebegin', favoritesHtml);
        }
    }
    
    removeFavorite(dishName) {
        const index = this.favorites.indexOf(dishName);
        if (index > -1) {
            this.favorites.splice(index, 1);
            this.saveFavorites();
            this.displayFavorites();
            
            // 현재 표시된 하트 버튼도 업데이트
            const heartButtons = document.querySelectorAll('.heart-button');
            heartButtons.forEach(button => {
                if (button.dataset.dish === dishName) {
                    button.classList.remove('favorited');
                    button.innerHTML = '🤍';
                }
            });
        }
    }
}

// 페이지 로드 시 MealService 초기화
let mealService;
document.addEventListener('DOMContentLoaded', () => {
    mealService = new MealService();
});

function cleanCurrentURL() {
  try {
    const path = window.location.pathname;
    if (path.endsWith('/index.html') || path.endsWith('/index') || path.endsWith('/home')) {
      const cleanPath = path.replace(/\/(index(\.html)?|home)$/, '') || '/';
      window.history.replaceState(null, '', cleanPath + window.location.search + window.location.hash);
    }
  } catch (e) {}
}
cleanCurrentURL();

function escapeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

document.addEventListener('DOMContentLoaded', () => {

  initHeader();
  initMobileMenu();
  initSmoothScroll();
  initScrollAnimations();
  initCounterAnimation();
  initPricingTabs();
  initDynamicPricing();
  initKBJUCalculator();
  initModals();
  initContactForms();
});

const DEFAULT_PRICING = {
  visit1: 100,
  visit8: 400,
  visit12: 500,
  unlimited1: 600,
  unlimited3: 1450,
  unlimited6: 2500,
  unlimited12: 4800,
  pt1: 200,
  pt2: 150
};

function initDynamicPricing() {
  let pricing = DEFAULT_PRICING;
  try {
    const saved = JSON.parse(localStorage.getItem('xfitness_pricing_config'));
    if (saved) pricing = { ...DEFAULT_PRICING, ...saved };
  } catch (err) {
    console.error('Error loading dynamic pricing:', err);
  }

  document.querySelectorAll('[data-price-key]').forEach(el => {
    const key = el.getAttribute('data-price-key');
    if (pricing[key] !== undefined) {
      el.textContent = Number(pricing[key]).toLocaleString('ro-RO');
    }
  });
}

function initHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  const handleScroll = () => {
    if (window.scrollY > 30) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

function initMobileMenu() {
  const toggleBtn = document.getElementById('menuToggle');
  const mobileNav = document.getElementById('mobileNav');
  const overlay = document.getElementById('navOverlay');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link');

  if (!toggleBtn || !mobileNav || !overlay) return;

  const openMenu = () => {
    toggleBtn.classList.add('active');
    mobileNav.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };

  const closeMenu = () => {
    toggleBtn.classList.remove('active');
    mobileNav.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };

  toggleBtn.addEventListener('click', () => {
    if (mobileNav.classList.contains('open')) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  overlay.addEventListener('click', closeMenu);

  mobileLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

function initSmoothScroll() {
  const anchorLinks = document.querySelectorAll('a[href^="#"]:not([href="#"])');
  
  anchorLinks.forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId.startsWith('#modal')) return; 

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerHeight = document.querySelector('.header')?.offsetHeight || 70;
        const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

function initScrollAnimations() {
  const revealElements = document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right, .reveal-scale, .reveal-stagger');
  
  if (!revealElements.length) return;

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          if (entry.target.classList.contains('reveal-stagger')) {
            const children = Array.from(entry.target.children);
            children.forEach((child, idx) => {
              child.style.transitionDelay = `${(idx + 1) * 0.08}s`;
              child.classList.add('revealed');
            });
          }
          obs.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add('revealed'));
  }
}

function initCounterAnimation() {
  const counterElements = document.querySelectorAll('[data-counter]');
  if (!counterElements.length) return;

  let animated = false;

  const runCounters = () => {
    counterElements.forEach(counter => {
      const target = parseInt(counter.getAttribute('data-counter'), 10) || 0;
      const suffix = counter.getAttribute('data-counter-suffix') || '';
      const prefix = counter.getAttribute('data-counter-prefix') || '';
      const duration = 1200; 
      const startTime = performance.now();

      const updateCount = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        const easeOut = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        const currentVal = Math.floor(easeOut * target);

        counter.textContent = `${prefix}${currentVal}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          counter.textContent = `${prefix}${target}${suffix}`;
        }
      };

      requestAnimationFrame(updateCount);
    });
  };

  const statsBar = document.querySelector('.bigsport-stats-bar');
  if (statsBar && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !animated) {
          animated = true;
          runCounters();
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });
    observer.observe(statsBar);
  } else {
    runCounters();
  }
}

function initPricingTabs() {
  const tabButtons = document.querySelectorAll('.pricing-tab-btn');
  const tabPanes = document.querySelectorAll('.pricing-tab-pane');

  if (!tabButtons.length || !tabPanes.length) return;

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');

      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      tabPanes.forEach(pane => {
        if (pane.id === targetTab) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });
}

function initKBJUCalculator() {
  const calcForm = document.getElementById('kbjuForm');
  if (!calcForm) return;

  const ageInput = document.getElementById('calcAge');
  const heightInput = document.getElementById('calcHeight');
  const weightInput = document.getElementById('calcWeight');
  const targetWeightInput = document.getElementById('calcTargetWeight');
  const activityInput = document.getElementById('calcActivity');

  const calorieVal = document.getElementById('resCalories');
  const goalTag = document.getElementById('resGoalTag');
  const proteinVal = document.getElementById('resProtein');
  const fatVal = document.getElementById('resFat');
  const carbsVal = document.getElementById('resCarbs');
  const bmrVal = document.getElementById('resBmr');
  const waterVal = document.getElementById('resWater');
  
  const barProtein = document.getElementById('barProtein');
  const barFat = document.getElementById('barFat');
  const barCarbs = document.getElementById('barCarbs');

  const calculate = () => {
    const gender = document.querySelector('input[name="gender"]:checked')?.value || 'male';
    const goal = document.querySelector('input[name="goal"]:checked')?.value || 'lose';
    
    const age = parseFloat(ageInput.value) || 28;
    const height = parseFloat(heightInput.value) || 175;
    const weight = parseFloat(weightInput.value) || 75;
    const activity = parseFloat(activityInput.value) || 1.375;

    let bmr = 0;
    if (gender === 'male') {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    const tdee = Math.round(bmr * activity);

    let targetCalories = tdee;
    let goalText = 'Menținere';

    if (goal === 'lose') {
      targetCalories = Math.max(1200, Math.round(tdee - 400));
      goalText = 'Deficit: -400 kcal';
    } else if (goal === 'gain') {
      targetCalories = Math.round(tdee + 350);
      goalText = 'Surplus: +350 kcal';
    }

    let proteinPerKg = 1.8;
    if (goal === 'lose') proteinPerKg = 2.0;
    if (goal === 'gain') proteinPerKg = 2.2;

    const proteinGrams = Math.round(weight * proteinPerKg);
    const proteinKcal = proteinGrams * 4;

    const fatGrams = Math.round(weight * 0.9);
    const fatKcal = fatGrams * 9;

    let remainingKcal = targetCalories - (proteinKcal + fatKcal);
    if (remainingKcal < 200) remainingKcal = 200;
    const carbsGrams = Math.round(remainingKcal / 4);

    const waterLiters = (weight * 0.035).toFixed(1);

    if (calorieVal) {
      calorieVal.textContent = targetCalories.toLocaleString('ro-RO');
      const calorieBox = calorieVal.closest('.calorie-number');
      if (calorieBox) {
        calorieBox.classList.remove('pulse');
        void calorieBox.offsetWidth; 
        calorieBox.classList.add('pulse');
      }
    }
    if (goalTag) goalTag.textContent = goalText;
    if (proteinVal) proteinVal.textContent = `${proteinGrams} g`;
    if (fatVal) fatVal.textContent = `${fatGrams} g`;
    if (carbsVal) carbsVal.textContent = `${carbsGrams} g`;
    if (bmrVal) bmrVal.textContent = `${Math.round(bmr)} kcal`;
    if (waterVal) waterVal.textContent = `${waterLiters} L/zi`;

    const totalMacrosGrams = proteinGrams + fatGrams + carbsGrams;
    if (totalMacrosGrams > 0) {
      if (barProtein) barProtein.style.width = `${Math.round((proteinGrams / totalMacrosGrams) * 100)}%`;
      if (barFat) barFat.style.width = `${Math.round((fatGrams / totalMacrosGrams) * 100)}%`;
      if (barCarbs) barCarbs.style.width = `${Math.round((carbsGrams / totalMacrosGrams) * 100)}%`;
    }
  };

  calcForm.addEventListener('input', calculate);
  calcForm.addEventListener('change', calculate);
  calcForm.addEventListener('submit', (e) => {
    e.preventDefault();
    calculate();
  });

  calculate();

  const sendToTrainerBtn = document.getElementById('sendCalcResultsBtn');
  if (sendToTrainerBtn) {
    sendToTrainerBtn.addEventListener('click', () => {
      const targetCalories = calorieVal?.textContent || '';
      const goal = document.querySelector('input[name="goal"]:checked')?.value || 'lose';
      let goalName = 'Slăbire';
      if (goal === 'maintain') goalName = 'Menținere';
      if (goal === 'gain') goalName = 'Creștere Masă';

      openBookingModal(`Consultantă Nutriție (${goalName}, ${targetCalories} kcal)`);
    });
  }
}

function initModals() {
  const modalBackdrops = document.querySelectorAll('.modal-backdrop');
  const closeButtons = document.querySelectorAll('.modal-close-btn, [data-close-modal]');

  const closeModal = (modal) => {
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal-backdrop');
      closeModal(modal);
    });
  });

  modalBackdrops.forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        closeModal(backdrop);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      modalBackdrops.forEach(modal => {
        if (modal.classList.contains('active')) {
          closeModal(modal);
        }
      });
    }
  });

  const privacyTriggers = document.querySelectorAll('[data-open-privacy]');
  const privacyModal = document.getElementById('privacyModal');
  privacyTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      if (privacyModal) {
        privacyModal.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });
  });

  const bookingTriggers = document.querySelectorAll('[data-book-plan]');
  bookingTriggers.forEach(btn => {
    btn.addEventListener('click', () => {
      const planName = btn.getAttribute('data-book-plan') || 'Antrenament de Probă';
      openBookingModal(planName);
    });
  });
}

function openBookingModal(planName = 'Antrenament de Probă') {
  const modal = document.getElementById('bookingModal');
  const titleElem = document.getElementById('modalBookingTitle');
  const planInput = document.getElementById('modalSelectedPlan');

  if (modal) {
    if (titleElem) {
      titleElem.textContent = `Înscriere: ${planName}`;
    }
    if (planInput) {
      planInput.value = planName;
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function initContactForms() {
  const forms = document.querySelectorAll('.ajax-form');

  forms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn ? submitBtn.innerHTML : 'Trimite';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
          <svg style="animation: spin 1s linear infinite; width:18px; height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
          Se trimite...
        `;
      }

      let leadData = {
        id: 'LEAD-' + Date.now().toString(36).toUpperCase(),
        date: new Date().toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        status: 'Nou',
        source: 'Website'
      };

      const hpVal = form.querySelector('input[name="x_hp_check"]')?.value;
      if (hpVal) {
        setTimeout(() => {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = originalText; }
          form.reset();
          showToast('Mulțumim! Cererea a fost înregistrată cu succes.');
        }, 400);
        return;
      }

      if (form.id === 'bookingForm') {
        leadData.name = escapeHTML(document.getElementById('bookName')?.value || 'Client Nou');
        leadData.phone = escapeHTML(document.getElementById('bookPhone')?.value || '');
        leadData.plan = escapeHTML(document.getElementById('modalSelectedPlan')?.value || 'General');
        leadData.details = escapeHTML('Orar: ' + (document.getElementById('bookPreferredTime')?.value || 'Seara'));
      } else if (form.id === 'mainContactForm') {
        leadData.name = escapeHTML(document.getElementById('contactName')?.value || 'Client Nou');
        leadData.phone = escapeHTML(document.getElementById('contactPhone')?.value || '');
        leadData.plan = escapeHTML(document.getElementById('contactInterest')?.value || 'Contact General');
        leadData.details = escapeHTML(document.getElementById('contactMessage')?.value || 'Fără mesaj specific');
      }

      try {
        const existingLeads = JSON.parse(localStorage.getItem('xfitness_leads') || '[]');
        existingLeads.unshift(leadData);
        localStorage.setItem('xfitness_leads', JSON.stringify(existingLeads));
      } catch (err) {
        console.error('Eroare salvare lead local:', err);
      }

      if (window.dbClient?.insertLead) {
        window.dbClient.insertLead(leadData);
      }

      setTimeout(() => {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
        }

        const activeModal = form.closest('.modal-backdrop');
        if (activeModal) {
          activeModal.classList.remove('active');
          document.body.style.overflow = '';
        }

        form.reset();

        showToast('Mulțumim! Cererea a fost înregistrată cu succes. Te vom contacta în curând.');
      }, 600);
    });
  });
}

function showToast(message) {
  let toast = document.getElementById('toastNotification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <div class="toast-icon">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    </div>
    <div class="toast-text">${message}</div>
  `;

  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 4500);
}

window.openBookingModal = openBookingModal;

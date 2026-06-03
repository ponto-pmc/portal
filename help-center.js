// HelpCenter module (extracted from faq.js)
export default class HelpCenter {
  constructor() {
    this.elements = {
      gestorContent: document.getElementById('gestor-content'),
      usuarioContent: document.getElementById('usuario-content'),
      accordionHeaders: document.querySelectorAll('.accordion-header'),
      darkToggle: document.getElementById('dark-mode-toggle'),
      mainView: document.getElementById('main-view'),
      contentArea: document.getElementById('content-area'),
      backButton: document.getElementById('backButton'),
      mainBackButton: document.getElementById('mainBackButton'),
      mainBackButtonContainer: document.getElementById('mainBackButtonContainer'),
      profileCards: document.querySelectorAll('.profile-card'),
      body: document.body
    };
    this.currentProfile = null;
    this.isAnimating = false;
    this.init();
  }
  init() {
    this.setupEventListeners();
    this.setupIntersectionObserver();
    this.setupParallaxEffect();
    this.loadUserPreferences();
    this.initializeAnimations();
  }
  setupEventListeners() {
    this.elements.profileCards.forEach(card => {
      card.addEventListener('click', (e) => this.handleProfileSelection(e));
      card.addEventListener('mouseenter', (e) => this.handleCardHover(e));
      card.addEventListener('mouseleave', (e) => this.handleCardLeave(e));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleProfileSelection(e);
        }
      });
      card.setAttribute('tabindex', '0');
    });
    this.elements.backButton.addEventListener('click', (e) => {
      this.addRippleEffect(e);
      this.goBackToProfile();
    });
    this.elements.mainBackButton.addEventListener('click', (e) => {
      this.addRippleEffect(e);
      if (this.currentProfile) this.goBackToProfile();
      else window.history.back();
    });
    this.elements.accordionHeaders.forEach(header => {
      header.addEventListener('click', (e) => this.handleAccordionClick(e));
    });
    this.elements.darkToggle.addEventListener('change', (e) => {
      this.toggleDarkMode(e.target.checked);
    });
    document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
    document.addEventListener('click', (e) => {
      if (e.target.matches('a[href^="#"]')) {
        e.preventDefault();
        this.smoothScrollTo(e.target.getAttribute('href'));
      }
    });
    window.addEventListener('resize', this.debounce(() => {
      this.handleResize();
    }, 250));
  }
  handleProfileSelection(e) {
    if (this.isAnimating) return;
    const card = e.currentTarget;
    const profile = card.getAttribute('data-profile');
    this.animateCardSelection(card);
    setTimeout(() => { this.showContent(profile); }, 300);
  }
  handleCardHover(e) {
    const card = e.currentTarget;
    const particles = card.querySelectorAll('.particle');
    particles.forEach((particle, index) => {
      setTimeout(() => { particle.style.animation = 'particle-float 3s ease-out infinite'; }, index * 100);
    });
    card.style.setProperty('--glow-opacity', '1');
  }
  handleCardLeave(e) {
    const card = e.currentTarget;
    const particles = card.querySelectorAll('.particle');
    particles.forEach(particle => { particle.style.animation = 'none'; });
    card.style.setProperty('--glow-opacity', '0');
  }
  animateCardSelection(card) {
    this.isAnimating = true;
    card.classList.add('selecting');
    const pulse = document.createElement('div');
    pulse.className = 'selection-pulse';
    pulse.style.cssText = `
      position: absolute; top: 50%; left: 50%; width: 0; height: 0;
      background: radial-gradient(circle, rgba(102,126,234,0.3) 0%, transparent 70%);
      border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; z-index: 10;
      animation: selection-pulse 0.6s ease-out forwards;`;
    card.appendChild(pulse);
    setTimeout(() => {
      card.classList.remove('selecting');
      pulse.remove();
      this.isAnimating = false;
    }, 600);
  }
  showContent(profile) {
    this.fadeOut(this.elements.mainView, () => {
      this.elements.mainView.classList.add('hidden');
      this.elements.contentArea.classList.remove('hidden');
      this.elements.gestorContent.classList.add('hidden');
      this.elements.usuarioContent.classList.add('hidden');
      if (profile === 'gestor') this.elements.gestorContent.classList.remove('hidden');
      else if (profile === 'usuario') this.elements.usuarioContent.classList.remove('hidden');
      this.currentProfile = profile;
      this.fadeIn(this.elements.contentArea);
      this.animateAccordionItems();
    });
  }
  goBackToProfile() {
    this.fadeOut(this.elements.contentArea, () => {
      this.elements.contentArea.classList.add('hidden');
      this.elements.mainView.classList.remove('hidden');
      this.currentProfile = null;
      this.fadeIn(this.elements.mainView);
      this.resetAccordion();
    });
  }
  handleAccordionClick(e) {
    const header = e.currentTarget;
    const body = header.nextElementSibling;
    const isActive = header.classList.contains('active');
    this.elements.accordionHeaders.forEach(h => {
      if (h !== header) {
        h.classList.remove('active');
        const b = h.nextElementSibling;
        this.slideUp(b);
      }
    });
    if (isActive) {
      header.classList.remove('active');
      this.slideUp(body);
    } else {
      header.classList.add('active');
      this.slideDown(body);
      setTimeout(() => {
        header.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }
  toggleDarkMode(isDark) {
    this.elements.body.classList.add('theme-transitioning');
    if (isDark) this.elements.body.classList.add('dark-mode');
    else this.elements.body.classList.remove('dark-mode');
    localStorage.setItem('darkMode', isDark);
    setTimeout(() => { this.elements.body.classList.remove('theme-transitioning'); }, 300);
    this.updateThemeColors();
  }
  handleKeyboardNavigation(e) {
    if (e.key === 'Escape' && this.currentProfile) this.goBackToProfile();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const activeElement = document.activeElement;
      if (activeElement.classList.contains('accordion-header')) {
        e.preventDefault();
        const headers = Array.from(this.elements.accordionHeaders);
        const currentIndex = headers.indexOf(activeElement);
        const nextIndex = e.key === 'ArrowDown'
          ? (currentIndex + 1) % headers.length
          : (currentIndex - 1 + headers.length) % headers.length;
        headers[nextIndex].focus();
      }
    }
  }
  addRippleEffect(e) {
    const button = e.currentTarget;
    const ripple = button.querySelector('.btn-ripple');
    if (ripple) {
      ripple.style.width = '0';
      ripple.style.height = '0';
      setTimeout(() => { ripple.style.width = '300px'; ripple.style.height = '300px'; }, 10);
    }
  }
  fadeOut(element, callback) {
    element.style.opacity = '1';
    element.style.transform = 'translateY(0)';
    element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(-20px)';
    });
    setTimeout(() => { if (callback) callback(); }, 300);
  }
  fadeIn(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    requestAnimationFrame(() => {
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });
  }
  slideDown(element) {
    element.style.display = 'block';
    element.style.height = '0';
    element.style.opacity = '0';
    element.style.overflow = 'hidden';
    element.style.transition = 'height 0.3s ease, opacity 0.3s ease';
    const height = element.scrollHeight;
    requestAnimationFrame(() => {
      element.style.height = height + 'px';
      element.style.opacity = '1';
    });
    setTimeout(() => {
      element.style.height = 'auto';
      element.style.overflow = 'visible';
    }, 300);
  }
  slideUp(element) {
    element.style.height = element.offsetHeight + 'px';
    element.style.transition = 'height 0.3s ease, opacity 0.3s ease';
    element.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      element.style.height = '0';
      element.style.opacity = '0';
    });
    setTimeout(() => { element.style.display = 'none'; }, 300);
  }
  animateAccordionItems() {
    const items = document.querySelectorAll('.accordion-item');
    items.forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      setTimeout(() => {
        item.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, index * 100);
    });
  }
  resetAccordion() {
    this.elements.accordionHeaders.forEach(header => {
      header.classList.remove('active');
      const body = header.nextElementSibling;
      body.style.display = 'none';
    });
  }
  setupIntersectionObserver() {
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); });
    }, observerOptions);
    document.querySelectorAll('.profile-card, .accordion-item').forEach(el => observer.observe(el));
  }
  setupParallaxEffect() {
    const shapes = document.querySelectorAll('.floating-shape');
    window.addEventListener('scroll', this.throttle(() => {
      const scrolled = window.pageYOffset;
      shapes.forEach((shape, index) => {
        const speed = 0.5 + (index * 0.1);
        const yPos = -(scrolled * speed);
        shape.style.transform = `translateY(${yPos}px) rotate(${scrolled * 0.1}deg)`;
      });
    }, 16));
  }
  loadUserPreferences() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    if (darkMode) {
      this.elements.body.classList.add('dark-mode');
      this.elements.darkToggle.checked = true;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) this.elements.body.classList.add('reduced-motion');
  }
  updateThemeColors() {
    const isDark = this.elements.body.classList.contains('dark-mode');
    const root = document.documentElement;
    if (isDark) {
      root.style.setProperty('--dynamic-bg', '#1e1b4b');
      root.style.setProperty('--dynamic-text', '#f1f5f9');
    } else {
      root.style.setProperty('--dynamic-bg', '#f7fafc');
      root.style.setProperty('--dynamic-text', '#2d3748');
    }
  }
  initializeAnimations() {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes selection-pulse { 0%{width:0;height:0;} 100%{width:300px;height:300px;opacity:0;} }
      .theme-transitioning * { transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease !important; }
      .visible { animation: fadeInUp 0.6s ease forwards; }
      @keyframes fadeInUp { from { opacity:0; transform:translateY(30px);} to { opacity:1; transform:translateY(0);} }
      .reduced-motion * { animation-duration:0.01ms !important; animation-iteration-count:1 !important; transition-duration:0.01ms !important; }`;
    document.head.appendChild(style);
  }
  handleResize() {
    const isMobile = window.innerWidth < 768;
    if (isMobile && this.currentProfile) {
      this.elements.contentArea.style.padding = '20px 10px';
    }
  }
  smoothScrollTo(target) {
    const element = document.querySelector(target);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  debounce(func, wait) {
    let timeout;
    return (...args) => {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
}
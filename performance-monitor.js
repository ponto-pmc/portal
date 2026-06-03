// PerformanceMonitor module (extracted from faq.js)
export default class PerformanceMonitor {
  constructor() {
    this.metrics = { loadTime: 0, renderTime: 0, interactionDelay: 0 };
    this.measurePerformance();
  }
  measurePerformance() {
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0];
      if (navigation) this.metrics.loadTime = navigation.loadEventEnd - navigation.loadEventStart;
      if (window.location.hostname === 'localhost') {
        console.log('Performance Metrics:', this.metrics);
      }
    });
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.renderTime = entry.startTime;
          }
        }
      });
      observer.observe({ entryTypes: ['paint'] });
    }
  }
}
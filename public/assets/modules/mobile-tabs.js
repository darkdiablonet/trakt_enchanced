/**
 * Mobile Tab Dropdown Module
 */

class MobileTabs {
  constructor() {
    this.dropdownBtn = null;
    this.dropdownMenu = null;
    this.dropdownText = null;
    this.isOpen = false;
    this.currentTab = 'shows';
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.dropdownBtn = document.getElementById('mobileTabDropdown');
    this.dropdownMenu = document.getElementById('mobileTabMenu');
    this.dropdownText = document.getElementById('mobileTabText');
    
    if (!this.dropdownBtn || !this.dropdownMenu || !this.dropdownText) return;

    this.attachEvents();
    this.syncWithDesktopTabs();
  }

  attachEvents() {
    // Toggle dropdown
    this.dropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleDropdown();
    });

    // Options du dropdown
    const options = this.dropdownMenu.querySelectorAll('.mobile-tab-option');
    options.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const tab = option.getAttribute('data-tab');
        this.selectTab(tab);
        this.closeDropdown();
      });
    });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', () => {
      if (this.isOpen) {
        this.closeDropdown();
      }
    });

    // Fermer avec Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.closeDropdown();
      }
    });
  }

  toggleDropdown() {
    if (this.isOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  openDropdown() {
    this.dropdownMenu.classList.remove('hidden');
    this.dropdownBtn.querySelector('i:last-child').classList.add('rotate-180');
    this.isOpen = true;
  }

  closeDropdown() {
    this.dropdownMenu.classList.add('hidden');
    this.dropdownBtn.querySelector('i:last-child').classList.remove('rotate-180');
    this.isOpen = false;
  }

  selectTab(tabId) {
    // Cliquer sur l'onglet desktop correspondant pour déclencher le changement
    const desktopTab = document.getElementById('tabBtn' + this.capitalizeFirst(tabId));
    if (desktopTab) {
      desktopTab.click();
    }
    
    this.currentTab = tabId;
    this.updateDropdownText(tabId);
  }

  updateDropdownText(tabId) {
    const option = this.dropdownMenu.querySelector(`[data-tab="${tabId}"]`);
    if (option) {
      this.dropdownText.innerHTML = option.innerHTML;
    }
  }

  // Synchroniser avec les onglets desktop quand ils changent
  syncWithDesktopTabs() {
    // Observer les changements de classe active sur les onglets desktop
    const desktopTabs = document.querySelectorAll('.tabs-group:not(.md\\:hidden) button[data-tab]');
    
    desktopTabs.forEach(tab => {
      // Observer les changements de classe
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
            if (tab.classList.contains('tab-btn-active')) {
              const tabId = tab.getAttribute('data-tab');
              this.currentTab = tabId;
              this.updateDropdownText(tabId);
            }
          }
        });
      });
      
      observer.observe(tab, { attributes: true });
    });
  }

  capitalizeFirst(str) {
    const parts = str.split('_');
    return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  }
}

// Créer l'instance
const mobileTabs = new MobileTabs();

export default mobileTabs;
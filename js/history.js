import IonCalendar from '/js/calendar.js';

dayjs.extend(dayjs_plugin_customParseFormat);
// dayjs.extend(dayjs_plugin_localizedFormat);
dayjs.extend(dayjs_plugin_localeData);
// dayjs.locale('en') // https://cdn.jsdelivr.net/npm/dayjs@1/locale/zh-cn.js

class Application {
   constructor() {
      // Default options, may be overridden by saved settings
      this.options = {
         use24HoursFormat: true,
         timeBeforeTitle: false,
         sundayFirst: false,
         pageItems: 1000,
      };
      // State variables
      this.now = null;
      this.today = null;
      this.currentDay = null;
      this.isSearching = false;
      this.isLoading = false;
      this.controlPressed = false;
      this.shiftPressed = false;
      this.multiSelectLastEntry = null;
      this.currentPage = 1;
      this.searchQuery = '';
      this.throttleSearch = null;

      this.refreshTime(); // Initial time setup
      this.init();        // Start initialization
   }

   init() {
      this.i18n();

      // Set Day.js locale based on browser language preference
      try {
         const currentLocale = this.getCurrentLocale();
         if (dayjs.locale() !== currentLocale) dayjs.locale(currentLocale);
      } catch (e) {
         console.warn(`Day.js locale '${this.getCurrentLocale()}' failed to load. Falling back to '${dayjs.locale()}'.`, e);
      }

      // Determine default for sundayFirst based on the current Day.js locale
      let defaultSundayFirst = false;
      try {
         defaultSundayFirst = dayjs.localeData().firstDayOfWeek() === 0; // 0 = Sunday
      } catch (e) {
         console.error("Failed to get locale data for sundayFirst default.", e);
      }

      browser.storage.sync.get(items => {
         this.setOptions(items, defaultSundayFirst);
         document.body.classList.contains('popup') ? this.initPopup() : this.initMain();
      });
   }

   getToday() {
      return dayjs().startOf('day').toDate(); // Returns a Date object for 00:00:00 today
   }

   refreshTime() {
      this.now = new Date(); // Current time
      this.today = this.getToday();
   }

   setOptions(items, defaultSundayFirst) {
      this.options.use24HoursFormat = items.use24HoursFormat ?? true;
      this.options.timeBeforeTitle = items.timeBeforeTitle ?? false;
      this.options.sundayFirst = items.sundayFirst ?? defaultSundayFirst;
      this.options.pageItems = +items.pageItems || 1000;
   }

   // --- Popup Initialization ---
   initPopup() {
      this.historyGetDay(this.today);
      this.setupHistoryEntryManager();
      document.getElementById('go_history').addEventListener('click', this.openHistoryPage.bind(this));
   }

   openHistoryPage(e) {
      e.preventDefault();
      browser.runtime.sendMessage({ command: 'open-history-page' }, response => {
         if (browser.runtime.lastError) {
            console.error("Error sending message:", browser.runtime.lastError);
         }
      });
   }

   // --- Main Page Initialization ---
   initMain() {
      this.refreshTime();
      this.setupMainElements();
      this.initCalendar();
      this.historyGetDay(this.today); // Initial view
   }

   setupMainElements() {
      this.setupOptionButtons();
      this.setupSearch();
      this.setupHistoryEntryManager();

      const goToday = document.getElementById('go_today');

      goToday.addEventListener('click', e => {
         e.preventDefault();
         this.historyGetDay(this.today);
         this.calendar?.selectToday();
      });
   }

   setupOptionButtons() {
      const goOptions = document.getElementById('go_options');
      const optionsForm = document.getElementById('options-form');
      const optionsCancel = document.getElementById('options_cancel');
      const optionsClose = document.getElementById('options_close');
      const modalOverlay = document.getElementById('modal_options');

      goOptions.addEventListener('click', this.openOptions.bind(this));
      optionsForm.addEventListener('submit', this.handleOptionsSubmit.bind(this));
      optionsCancel.addEventListener('click', () => this.closeOptions());
      optionsClose.addEventListener('click', () => this.closeOptions());

      modalOverlay.addEventListener('click', evt => {
         if (evt.target === evt.currentTarget) this.closeOptions();
      });
   }

   setupSearch() {
      const searchInput = document.getElementById('search_input');
      const searchClear = document.getElementById('search_clear');
      const searchContainer = searchInput.parentElement;

      this.throttleSearch = this.debounce(this.historySearch, 500);

      searchInput.addEventListener('focusin', () => searchContainer.classList.add('focus'));
      searchInput.addEventListener('focusout', () => searchContainer.classList.remove('focus'));
      searchInput.addEventListener('input', this.inputSearch.bind(this));
      // searchInput.addEventListener('change', this.inputSearch.bind(this)); // on input completion

      searchClear.addEventListener('click', e => {
         e.preventDefault();
         searchInput.value = '';
         searchInput.focus();
         this.resetSearch();
         searchClear.style.display = 'none';
      });

      searchClear.style.display = searchInput.value ? 'flex' : 'none';
      searchInput.focus();
   }

   setupHistoryEntryManager() {
      const clearConfirm = document.getElementById('clear_confirm');
      const clearCancel = document.getElementById('clear_cancel');

      clearConfirm.addEventListener('click', e => {
         e.preventDefault();
         this.removeSelectedEntries();
      });

      clearCancel.addEventListener('click', e => {
         e.preventDefault();
         this.clearSelectedItems();
      });

      document.addEventListener('keydown', this.handleKeyDown.bind(this));
      document.addEventListener('keyup', this.handleKeyUp.bind(this));
      document.addEventListener('click', this.handleDocumentClick.bind(this));
   }

   // --- Keyboard Handling ---
   handleKeyDown(e) {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.controlPressed = true;
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftPressed = true;
      else this.handleGlobalKeyPress(e);
   }

   handleKeyUp(e) {
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.controlPressed = false;
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.shiftPressed = false;
   }

   handleGlobalKeyPress(e) {
      if (e.target.id === 'search_input') return; // Ignore typing in search

      // Use e.code for shortcuts
      switch (e.code) {
         case 'KeyA': // Ctrl+A: Select all
            if (this.controlPressed) {
               e.preventDefault();
               this.selectAllEntries();
            }
            break;
         case 'Delete': // Delete selected
            if (document.querySelector('.history-container .entry.selected')) {
               this.showRemoveConfirmation();
            }
            break;
         case 'Escape': // Clear selection
            this.clearSelectedItems();
            break;
      }
   }

   // --- Global Click ---
   handleDocumentClick(e) {
      // Deselect if click is outside relevant areas
      if (!e.target.closest('.entry') && !e.target.closest('.remove-confirmation')) {
         this.clearSelectedItems();
      }
   }

   // --- Calendar ---
   initCalendar() {
      const calendarContainer = document.querySelector('.sidebar .nav .content');
      const calendarElement = document.createElement('div');
      calendarElement.classList.add('calendar');
      calendarContainer.prepend(calendarElement);

      if (typeof IonCalendar === 'undefined') {
         console.error("IonCalendar class is not defined.");
         return;
      }

      const todayForCalendar = dayjs(this.today);

      this.calendar = new IonCalendar(calendarElement, {
         sundayFirst: this.options.sundayFirst,
         startDate: todayForCalendar,
         maxDate: todayForCalendar,
         yearRange: `${this.now.getFullYear() - 3}-${this.now.getFullYear()}`,
         format: 'dayjs',
         onClick: dateObject => {
            const date = dayjs.isDayjs(dateObject) ? dateObject.toDate() : dayjs(dateObject).toDate();
            if (dayjs(date).isValid()) {
               this.historyGetDay(date);
            }
            else {
               console.error("Invalid date received from calendar onClick:", dateObject);
            }
         }
      });
   }

   getCurrentLocale() {
      return browser.i18n.getMessage('language') || 'en';
   }

   // --- Search ---
   inputSearch() {
      const searchInput = document.getElementById('search_input');
      const searchClear = document.getElementById('search_clear');
      const searchQuery = searchInput.value;

      searchClear.style.display = searchQuery ? 'flex' : 'none';

      if (searchQuery) {
         this.throttleSearch(searchQuery);
      }
      else {
         this.resetSearch();
      }
   }

   resetSearch() {
      this.throttleSearch?.cancel();
      this.searchQuery = '';
      this.isSearching = false;

      const searchInput = document.getElementById('search_input');
      if (searchInput) searchInput.value = '';
      const searchClear = document.getElementById('search_clear');
      if (searchClear) searchClear.style.display = 'none';

      // Reload current day view. Avoids potential double load if reset was triggered by historyGetDay.
      // Consider if this is always the desired behavior on reset.
      this.historyGetDay(this.currentDay || this.today);
   }

   historySearch(query) {
      this.refreshTime();
      this.isSearching = true;
      this.isLoading = true;
      this.clearContent();
      this.updateLoadingState();
      this.searchQuery = query;
      this.currentPage = 1;
      const dateStart = dayjs(0).toDate();
      const dateEnd = dayjs(this.today).endOf('day').toDate();
      this.historyQuery(query, dateStart, dateEnd);
   }

   // --- History Data Loading ---
   historyGetDay(day, currentPage = 1) {
      this.refreshTime();
      const dayObj = dayjs(day);

      if (dayObj.isAfter(this.now, 'day')) return; // Don't load future dates

      this.currentDay = day instanceof Date ? day : dayObj.toDate();
      this.currentPage = currentPage;

      if (this.isSearching) {
         this.resetSearch(); // This triggers its own historyGetDay
         return;
      }

      const dateStart = dayObj.startOf('day').toDate();
      const dateEnd = dayObj.endOf('day').toDate();
      this.isLoading = true;
      this.clearContent();
      this.updateLoadingState();
      this.historyQuery('', dateStart, dateEnd); // No search text for day view
   }

   historyQuery(search, start, end) {
      this.isLoading = true;
      this.updateLoadingState();

      browser.history.search({
         text: search,
         startTime: start.getTime(),
         endTime: end.getTime(),
         maxResults: 10000
      }, results => {
         this.isLoading = false; // Set isLoading false before potential error display
         this.updateLoadingState();

         if (browser.runtime.lastError) {
            console.error('History search error:', browser.runtime.lastError);
            this.displayError('Failed to load history.');
            return;
         }

         const totalApiResults = results.length;
         this.historyCallback(results, start, totalApiResults);
      });
   }

   historyCallback(rawResults, targetDayStart, totalApiResults) {
      const { pageItems } = this.options;
      const startIndex = (this.currentPage - 1) * pageItems;
      let pageResults;
      let itemsToRender = {};
      let totalResultsForPagination;

      if (this.isSearching) {
         // Process search results
         pageResults = rawResults.slice(startIndex, startIndex + pageItems);
         itemsToRender = this.groupResultsByDay(pageResults);
         totalResultsForPagination = totalApiResults;
      }
      else {
         // Process single day view results
         const targetDayMoment = dayjs(targetDayStart);
         const filteredResults = rawResults.filter(result =>
            dayjs(result.lastVisitTime).isSame(targetDayMoment, 'day')
         );
         totalResultsForPagination = filteredResults.length;
         pageResults = filteredResults.slice(startIndex, startIndex + pageItems);
         const dayKey = targetDayMoment.startOf('day').valueOf().toString();
         if (pageResults.length > 0 || (this.currentPage === 1 && totalResultsForPagination === 0)) {
            itemsToRender[dayKey] = pageResults;
         }
      }

      const countOnPage = pageResults?.length ?? 0;
      this.historyFormatDays(itemsToRender, totalResultsForPagination, countOnPage);
   }

   groupResultsByDay(results) {
      return results.reduce((acc, result) => {
         const itemKey = dayjs(result.lastVisitTime).startOf('day').valueOf().toString();
         (acc[itemKey] = acc[itemKey] || []).push(result);
         return acc;
      }, {});
   }

   paginateResults(items, currentPage, itemsPerPage) {
      if (!items || items.length === 0 || itemsPerPage <= 0) return [];

      const pageIndex = currentPage - 1; // 0-based index
      const startIndex = pageIndex * itemsPerPage;
      // slice end index is exclusive, so startIndex + itemsPerPage is correct
      return items.slice(startIndex, startIndex + itemsPerPage);
   }

   // --- Rendering ---
   historyFormatDays(items, totalResults, countOnPage) {
      this.clearContent();

      if (this.isSearching) {
         this.insertContent(`<h1>${browser.i18n.getMessage('search_display')} '${this.escape(this.searchQuery)}"</h1>`);
         const messageKey = totalResults > 0 ? 'search_found' : 'search_empty';
         this.insertContent(`<div class="search-result">${browser.i18n.getMessage(messageKey, totalResults.toString())}</div>`);
      }

      const sortedDays = Object.entries(items).sort(([keyA], [keyB]) => +keyB - +keyA);

      const fragment = document.createDocumentFragment();

      sortedDays.forEach(([k, dayEntries]) => {
         const dayDiv = document.createElement('div');
         dayDiv.className = 'history-day';
         dayDiv.setAttribute('date', k);

         const date = dayjs(+k).toDate();
         // fix - https://github.com/iamkun/dayjs/issues/2860
         // const dateFormat = browser.i18n.getMessage('date_format') || 'L';

         const dayJsDate = dayjs(date);
         const baseDateFormat = "dddd, MMMM";
         const yearFormat = "YYYY";
         let formattedDay;
         try {
            const dayNumber = dayJsDate.date();
            const ordinalStringWithBrackets = dayJsDate.localeData().ordinal(dayNumber);
            formattedDay = ordinalStringWithBrackets.replace(/^\[|\]$/g, '');
         } catch (e) {
            formattedDay = dayJsDate.format('D'); // Fallback
         }
         const finalFormattedDate = `${dayJsDate.format(baseDateFormat)} ${formattedDay}, ${dayJsDate.format(yearFormat)}`;
         const pageCountDisplay = this.isSearching ? '' : this.getPageCountDisplay(totalResults);
         dayDiv.innerHTML = `<h2>${finalFormattedDate}<span>${pageCountDisplay}</span></h2>`;
         // dayDiv.innerHTML = `<h2>${dayjs(date).format(dateFormat)}<span>${pageCountDisplay}</span></h2>`;
         // end fix

         if (dayEntries.length) {
            dayEntries.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
            dayEntries.forEach(entry => {
               dayDiv.insertAdjacentHTML('beforeend', this.historyEntryFormat(entry));
            });
         }
         else {
            dayDiv.insertAdjacentHTML('beforeend', `<div class="entry-empty">${browser.i18n.getMessage('history_date_empty')}</div>`);
         }
         fragment.appendChild(dayDiv);
      });

      document.querySelector('.history-container .content').appendChild(fragment);

      this.historyEntriesBind();
      this.insertPaginationControls(totalResults);
   }

   getPageCountDisplay(totalResults) {
      const { pageItems } = this.options;
      if (!totalResults || totalResults <= this.options.pageItems) return '';

      const itemsPerPage = pageItems;
      const currentPage = this.currentPage;

      const itemsShownSoFar = Math.min(currentPage * itemsPerPage, totalResults);

      // Return empty string if only one page, otherwise format page info
      //    return totalPages <= 1
      //       ? totalResults.toString()
      //       // Show Page X / Y"
      //       : browser.i18n.getMessage('pagination_page_info', [this.currentPage.toString(), totalPages.toString()]);

      return `${itemsShownSoFar} / ${totalResults}`;
   }

   historyEntryFormat(entry) {
      const timeFormat = this.options.use24HoursFormat ? 'HH:mm' : 'hh:mm A';
      const time = dayjs(entry.lastVisitTime).format(timeFormat);

      const originalUrl = entry.url;
      const escapedTitle = this.escape(entry.title || originalUrl);
      const escapedDisplayUrl = this.escape(originalUrl);
      const favicon = this.getFavicon(originalUrl);
      const { timeBeforeTitle } = this.options;

      return `
         <div class="entry">
            ${timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <img class="entry-icon" src="${favicon}" loading="lazy" alt=""/>
            <div class="entry-link"><a href="${originalUrl}" target="_blank" title="${escapedDisplayUrl}">${escapedTitle}</a></div>
            ${!timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <a href="#" class="entry-remove" title="${browser.i18n.getMessage('history_remove_single')}">✕</a>
         </div>
      `;
   }

   historyEntriesBind() {
      document.querySelectorAll('.history-container .entry')
         .forEach(entryElement => {
            this.bindEntryRemoveButton(entryElement);
            this.bindEntrySelection(entryElement);
         });
   }

   bindEntryRemoveButton(entryElement) {
      entryElement.querySelector('.entry-remove')?.addEventListener('click', e => {
         e.preventDefault();
         e.stopPropagation();
         const linkHref = entryElement.querySelector('.entry-link a')?.href;
         if (linkHref) {
            this.historyEntryDelete(linkHref, entryElement);
         }
      });
   }

   historyEntryDelete(url, entryElement) {
      const container = entryElement.parentElement;
      entryElement.remove(); // Optimistic removal

      browser.history.deleteUrl({ url: url }, () => {
         if (browser.runtime.lastError) {
            console.error(`Error deleting URL: ${url}`, browser.runtime.lastError);
            // Consider restoring the element or notifying the user
         }
         else {
            // Check if day container is empty after deletion
            if (container?.classList.contains('history-day') && !container.querySelector('.entry')) {
               const emptyMessage = `<div class="entry-empty">${browser.i18n.getMessage('history_date_empty')}</div>`;
               container.querySelector('h2')?.insertAdjacentHTML('afterend', emptyMessage);
            }
            this.updateConfirm(); // Update selection count/panel
         }
      });
   }

   // --- Selection Logic ---
   bindEntrySelection(entryElement) {
      entryElement.addEventListener('click', e => {
         if (e.target.closest('a')) return; // Ignore links
         e.preventDefault();

         const isSelected = entryElement.classList.contains('selected');

         if (this.shiftPressed && this.multiSelectLastEntry) {
            this.multiSelectRange(entryElement);
         }
         else if (this.controlPressed) {
            entryElement.classList.toggle('selected');
            this.multiSelectLastEntry = isSelected ? this.multiSelectLastEntry : entryElement; // Update last if selecting
         }
         else {
            // document.querySelectorAll('.history-container .entry.selected') // Normal click: Clear others, select this one
            //    .forEach(el => el.classList.remove('selected'));
            entryElement.classList.add('selected');
            this.multiSelectLastEntry = entryElement;
         }
         this.updateConfirm();
      });
   }

   multiSelectRange(endEntry) {
      const entries = Array.from(document.querySelectorAll('.history-container .entry'));
      const startIndex = entries.indexOf(this.multiSelectLastEntry);
      const endIndex = entries.indexOf(endEntry);

      if (startIndex === -1 || endIndex === -1) return;

      const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      entries.slice(start, end + 1).forEach(entry => entry.classList.add('selected'));
   }

   selectAllEntries() {
      const entries = document.querySelectorAll('.history-container .entry');
      entries.forEach(entry => entry.classList.add('selected'));
      // Set last selected to the actual last element in the list
      this.multiSelectLastEntry = entries.length ? entries[entries.length - 1] : null;
      this.updateConfirm();
   }

   clearSelectedItems() {
      document.querySelectorAll('.history-container .entry.selected')
         .forEach(entry => entry.classList.remove('selected'));
      this.multiSelectLastEntry = null;
      this.updateConfirm(); // Hide panel
   }

   // --- Remove Confirmation ---
   showRemoveConfirmation() {
      const removeConfirmation = document.querySelector('.remove-confirmation');
      const selectedCount = document.querySelectorAll('.history-container .entry.selected').length;

      if (selectedCount > 0) {
         removeConfirmation.classList.add('is-visible');
         const numElement = removeConfirmation.querySelector('.num');
         if (numElement) numElement.textContent = selectedCount.toString();
      }
   }

   updateConfirm() {
      const removeConfirmation = document.querySelector('.remove-confirmation');
      const selectedCount = document.querySelectorAll('.history-container .entry.selected').length;
      const numElement = removeConfirmation.querySelector('.num');

      removeConfirmation.classList.toggle('is-visible', selectedCount > 0);
      if (selectedCount > 0) {
         numElement.textContent = selectedCount.toString();
      }
   }

   removeSelectedEntries() {
      const selectedEntries = document.querySelectorAll('.history-container .entry.selected');
      Array.from(selectedEntries).forEach(entryElement => {
         const linkHref = entryElement.querySelector('.entry-link a')?.href;
         if (linkHref) {
            this.historyEntryDelete(linkHref, entryElement);
         }
      });
   }

   // --- Pagination ---
   insertPaginationControls(totalResults) {
      const { pageItems } = this.options;

      if (totalResults <= pageItems) return;

      const totalPages = Math.ceil(totalResults / pageItems);
      const paginationHTML = `
         <div class="pagination">
            <button id="prev_page" class="btn btn-secondary" ${this.currentPage <= 1 ? 'disabled' : ''}>
               ${browser.i18n.getMessage('pagination_prev')}
            </button>
            <span class="page-info">${this.getPageCountDisplay(totalResults)}</span>
            <button id="next_page" class="btn btn-secondary" ${this.currentPage >= totalPages ? 'disabled' : ''}>
               ${browser.i18n.getMessage('pagination_next')}
            </button>
         </div>`;
      this.insertContent(paginationHTML);
      this.bindPaginationControls(totalResults);
   }

   bindPaginationControls(totalResults) {
      const prevButton = document.getElementById('prev_page');
      const nextButton = document.getElementById('next_page');
      const totalPages = Math.ceil(totalResults / this.options.pageItems);

      if (prevButton) {
         prevButton.addEventListener('click', () => {
            if (this.currentPage > 1) {
               this.currentPage--;
               this.reloadCurrentView(); // Load previous page
            }
         });
      }

      if (nextButton) {
         nextButton.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
               this.currentPage++;
               this.reloadCurrentView(); // Load next page
            }
         });
      }
   }

   reloadCurrentView() {
      this.isLoading = true;
      this.clearContent();
      this.updateLoadingState();

      const queryParams = this.isSearching
         ? { search: this.searchQuery, start: dayjs(0).toDate(), end: dayjs(this.today).endOf('day').toDate() }
         : this.currentDay
            ? { search: '', start: dayjs(this.currentDay).startOf('day').toDate(), end: dayjs(this.currentDay).endOf('day').toDate() }
            : { search: '', start: dayjs(this.today).startOf('day').toDate(), end: dayjs(this.today).endOf('day').toDate() }; // Default to today

      this.historyQuery(queryParams.search, queryParams.start, queryParams.end);
   }

   // --- Utilities ---
   insertContent(html, context = null) {
      (context || document.querySelector('.history-container .content'))?.insertAdjacentHTML('beforeend', html);
   }

   clearContent() {
      const target = document.querySelector('.history-container .content');
      if (target) target.innerHTML = '';
   }

   updateLoadingState() {
      const container = document.querySelector('.history-container .content');
      if (!container) return;
      const loadingIndicatorClass = 'loading-indicator';
      container.querySelector(`.${loadingIndicatorClass}`)?.remove();

      if (this.isLoading) {
         const indicator = document.createElement('div');
         indicator.className = loadingIndicatorClass;
         indicator.textContent = browser.i18n.getMessage('loading') || 'Loading...';
         container.prepend(indicator);
      }
   }

   displayError(message) {
      this.clearContent();
      this.insertContent(`<div class="error-message">${this.escape(message)}</div>`);
   }

   i18n() {
      document.querySelectorAll('[i18n]').forEach(element => {
         const i18n = element.getAttribute('i18n');
         if (i18n.includes(':')) {
            const [attr, message] = i18n.split(':');
            element.setAttribute(attr, browser.i18n.getMessage(message));
         }
         else {
            element.textContent = browser.i18n.getMessage(i18n);
         }
      });
   }

   getFavicon(url) {
      try {
         new URL(url); // Validate URL structure
         // Use extension API (works in Chrome/Firefox within extension context)
         return (typeof chrome !== 'undefined')
            ? `chrome-extension://${browser.runtime.id}/_favicon/?size=16&pageUrl=${encodeURIComponent(this.escape(url))}` // chrome like
            : `chrome://favicon/size/16@2x/${url}`; // Firefox
      } catch (e) {
         // console.warn("Invalid URL for favicon:", url, e);
         return '/icons/default_favicon.png'; // Path to default icon in extension
      }
   }

   // --- Options Modal ---
   handleOptionsSubmit(evt) {
      evt.preventDefault();
      const form = evt.target;

      if (!form.checkValidity()) {
         form.reportValidity();
         return;
      }

      const formData = new FormData(form);
      const settingsToSave = {
         use24HoursFormat: formData.has('use24HoursFormat'),
         timeBeforeTitle: formData.has('timeBeforeTitle'),
         sundayFirst: formData.has('sundayFirst'),
         pageItems: parseInt(formData.get('pageItems'), 10) || 1000
      };

      browser.storage.sync.set(settingsToSave, () => {
         if (browser.runtime.lastError) {
            console.error("Error saving options:", browser.runtime.lastError);
            // TODO: Notify user of save error
         }
         else {
            this.options = { ...this.options, ...settingsToSave };
            this.closeOptions(true); // Close and reload
         }
      });
   }

   openOptions() {
      const form = document.getElementById('options-form');
      const modal = document.getElementById('modal_options');

      form.elements['use24HoursFormat'].checked = this.options.use24HoursFormat;
      form.elements['timeBeforeTitle'].checked = this.options.timeBeforeTitle;
      form.elements['sundayFirst'].checked = this.options.sundayFirst;
      form.elements['pageItems'].value = this.options.pageItems;

      modal.style.display = 'flex';
   }

   closeOptions(reload = false) {
      document.getElementById('modal_options').style.display = 'none';
      if (reload) {
         location.reload();
      }
   }

   // --- Helpers ---
   // Return non-strings as is; basic HTML escaping for strings
   escape(string) {
      return typeof string !== 'string' ? string : string
         .replace(/</g, '&#x3C;')
         .replace(/>/g, '&#x3E;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#039;');
   }

   debounce(func, wait) {
      let timeout;
      const debouncedFunction = function (...args) {
         clearTimeout(timeout);
         timeout = setTimeout(() => func.apply(this, args), wait);
      };
      debouncedFunction.cancel = () => clearTimeout(timeout);
      return debouncedFunction;
   }
}

// Initialize App when DOM is ready
(document.readyState === 'interactive' || document.readyState === 'complete')
   ? new Application()
   : window.addEventListener('DOMContentLoaded', () => new Application());

import IonCalendar from '/js/calendar.js';

dayjs.extend(dayjs_plugin_customParseFormat);
// dayjs.extend(dayjs_plugin_localizedFormat);
dayjs.extend(dayjs_plugin_localeData);
// dayjs.locale('en') // https://cdn.jsdelivr.net/npm/dayjs@1/locale/zh-cn.js

class Application {
   static DEFAULTS = {
      PAGE_ITEMS: 1000,
      MAX_HISTORY_RESULTS: 10000,
   };

   static SELECTORS = {
      // Containers
      historyContainer: '.history-container',
      contentContainer: '.history-container .content',
      sidebarNavContent: '.sidebar .nav .content',

      // Calendar
      calendar: '.calendar',

      // Navigation
      goToday: '#go_today',
      goHistory: '#go_history',
      goOptions: '#go_options',

      // Search
      searchInput: '#search_input',
      searchClear: '#search_clear',
      searchContainer: '.search-structure',

      // Settings modal
      optionsModal: '#modal-options',
      optionsForm: '#options-form',
      optionsClose: '#modal-close',

      // Delete confirmation modal
      removeConfirmation: '.remove-confirmation',
      confirmButton: '#clear_confirm',
      cancelButton: '#clear_cancel',

      // Dynamic elements
      entry: '.entry',
      entryLink: '.entry-link a',
      entryRemove: '.entry-remove',
      selectedEntry: '.entry.selected',
      prevPageButton: '#prev_page',
      nextPageButton: '#next_page',
   };

   // Cached DOM elements
   dom = {};

   // Default options, may be overridden by saved settings
   options;

   // State variables
   state;
   #now;
   #today;
   #throttleSearch;
   #calendar;
   #lastScrollPosition = 0;

   constructor() {
      this.state = {
         isLoading: true,
         isSearching: false,
         searchQuery: '',
         currentPage: 1,
         currentDay: null,
         controlPressed: false,
         shiftPressed: false,
         multiSelectLastUrl: null, // Store the latest click for Shift+Select
         selectedUrls: new Set(),  // Store the URL of all selected elements
      };
      // Default options, may be overridden by saved settings
      this.options = {
         use24HoursFormat: true,
         timeBeforeTitle: false,
         sundayFirst: false,
         pageItems: 1000,
      };
      // State variables
      this.#now = new Date();
      this.#today = Application.#getToday();
      this.#throttleSearch = Application.#debounce(this.#historySearch.bind(this), 500);
      this.#calendar = null;

      this.#cacheDOMElements();
      this.init();
   }

   async init() {
      Application.#i18n();

      // Set Day.js locale based on browser language preference
      try {
         const currentLocale = Application.#getCurrentLocale();
         if (dayjs.locale() !== currentLocale) dayjs.locale(currentLocale);
      } catch (err) {
         console.warn(`Day.js locale '${Application.#getCurrentLocale()}' failed to load.`, err);
      }

      const defaultSundayFirst = dayjs.localeData().firstDayOfWeek() === 0;

      try {
         const items = await Application.#promisify(browser.storage.sync, 'get', null);
         this.#setOptions(items, defaultSundayFirst);
      } catch (error) {
         console.error('Failed to initialize settings:', error);
      }

      document.body.classList.contains('popup') ? this.#initPopup() : this.#initMain();
   }

   // STATE MANAGEMENT

   setState(newState) {
      Object.assign(this.state, newState);
      this.#updateUIComponents();
   }

   // PAGE INITIALIZERS

   #initPopup() {
      this.#setupGlobalEventListeners();
      this.historyGetDay(this.#today);
      this.dom.goHistory.addEventListener('click', this.openHistoryPage.bind(this));
   }

   #initMain() {
      this.#refreshTime();
      this.#setupMainElements();
      this.#initCalendar();
      this.#setupGlobalEventListeners();
      this.historyGetDay(this.#today);
   }

   // EVENT LISTENER SETUP

   #setupMainElements() {
      this.#setupOptionButtons();
      this.#setupSearch();

      this.dom.goToday.addEventListener('click', evt => {
         evt.preventDefault();
         this.historyGetDay(this.#today);
         this.#calendar?.selectDate();
      });
   }

   #setupGlobalEventListeners() {
      this.dom.confirmButton.addEventListener('click', evt => {
         evt.preventDefault();
         this.#removeSelectedEntries();
      });

      this.dom.cancelButton.addEventListener('click', evt => {
         evt.preventDefault();
         this.clearSelectedItems();
      });

      this.dom.contentContainer.addEventListener('click', this.#handleHistoryClick.bind(this));

      // Global Click. Deselect if click is outside relevant areas
      document.addEventListener('click', ({ target }) => {
         const S = Application.SELECTORS;
         if (!target.closest(`${S.entry}, ${S.removeConfirmation}`)) {
            this.clearSelectedItems();
         }
      });

      document.addEventListener('keydown', this.#handleKeyDown.bind(this));
      document.addEventListener('keyup', this.#handleKeyUp.bind(this));
   }

   #setupSearch() {
      const { searchInput, searchClear, searchContainer } = this.dom;
      if (!searchInput) return;

      searchInput.addEventListener('focusin', () => searchContainer.classList.add('focus'));
      searchInput.addEventListener('focusout', () => searchContainer.classList.remove('focus'));
      searchInput.addEventListener('input', this.inputSearch.bind(this));
      // searchInput.addEventListener('change', this.inputSearch.bind(this)); // on input completion

      searchClear.addEventListener('click', evt => {
         evt.preventDefault();
         searchInput.value = '';
         searchInput.focus();
         this.#resetSearch();
      });

      searchClear.style.display = searchInput.value ? 'flex' : 'none';
      searchInput.focus();
   }

   #setupOptionButtons() {
      const { goOptions, optionsModal } = this.dom;

      goOptions?.addEventListener('click', () => this.openOptions());

      optionsModal?.addEventListener('close', () => {
         if (optionsModal.returnValue === 'save') {
            this.#saveOptions();
         }
      });
      optionsModal.addEventListener('click', ({ target }) => {
         if (target === optionsModal) optionsModal.close('cancel');
      });

      optionsModal?.addEventListener('cancel', optionsModal.close);
   }

   // EVENT HANDLERS

   openHistoryPage(evt) {
      evt.preventDefault();
      browser.runtime.sendMessage({ command: 'open-history-page' });
   }

   #handleHistoryClick(evt) {
      const S = Application.SELECTORS;
      const entryElement = evt.target.closest(S.entry);
      if (!entryElement) return;

      if (evt.target.closest(S.entryRemove)) {
         evt.preventDefault();
         evt.stopPropagation();
         const linkHref = entryElement.querySelector(S.entryLink)?.href;
         if (linkHref) this.#historyEntryDelete(linkHref, entryElement);
         return;
      }

      if (evt.target.closest('a')) return;
      evt.preventDefault();

      const clickedUrl = entryElement.querySelector(S.entryLink)?.href;
      if (!clickedUrl) return;

      const { shiftPressed, controlPressed, multiSelectLastUrl, selectedUrls } = this.state;
      const newSelectedUrls = new Set(selectedUrls);

      // Shift + Click
      if (shiftPressed && multiSelectLastUrl) {
         const urlsToSelect = this.#multiSelectRange(clickedUrl);
         urlsToSelect.forEach(url => newSelectedUrls.add(url));
      }
      // (Ctrl+) Click
      else {
         if (newSelectedUrls.has(clickedUrl)) {
            newSelectedUrls.delete(clickedUrl);
         } else {
            newSelectedUrls.add(clickedUrl);
         }
      }

      this.setState({
         selectedUrls: newSelectedUrls,
         multiSelectLastUrl: controlPressed && !newSelectedUrls.has(clickedUrl) ? multiSelectLastUrl : clickedUrl
      });
   }

   // --- Keyboard Handling ---
   #handleKeyDown(evt) {
      if (evt.code === 'ControlLeft' || evt.code === 'ControlRight') this.setState({ controlPressed: true });
      else if (evt.code === 'ShiftLeft' || evt.code === 'ShiftRight') this.setState({ shiftPressed: true });
      else this.#handleGlobalKeyPress(evt);
   }

   #handleKeyUp(evt) {
      if (evt.code === 'ControlLeft' || evt.code === 'ControlRight') this.setState({ controlPressed: false });
      else if (evt.code === 'ShiftLeft' || evt.code === 'ShiftRight') this.setState({ shiftPressed: false });
   }

   #handleGlobalKeyPress(evt) {
      if (evt.target === this.dom.searchInput) return; // Ignore typing in search

      // Use evt.code for shortcuts
      switch (evt.code) {
         case 'KeyA': // Ctrl+A: Select all
            if (this.state.controlPressed) {
               evt.preventDefault();
               this.selectAllEntries();
            }
            break;
         case 'Delete': // Delete selected
            if (this.state.selectedUrls.size > 0) {
               this.#updateRemoveConfirmation();
            }
            break;
         case 'Escape': // Clear selection
            this.clearSelectedItems();
            break;
      }
   }

   // DATA FETCHING & PROCESSING

   // --- History Data Loading ---
   historyGetDay(day, currentPage = 1) {
      this.#refreshTime();

      if (dayjs(day).isAfter(this.#now, 'day')) return;

      this.setState({ currentDay: day, currentPage, isSearching: false, searchQuery: '' });
      const dateStart = dayjs(day).startOf('day').toDate();
      const dateEnd = dayjs(day).endOf('day').toDate();
      this.#historyQuery('', dateStart, dateEnd);
   }

   #historySearch(query) {
      this.#refreshTime();

      this.setState({ isSearching: true, searchQuery: query, currentPage: 1 });
      const dateStart = dayjs(0).toDate();
      const dateEnd = dayjs(this.#today).endOf('day').toDate();
      this.#historyQuery(query, dateStart, dateEnd);
   }

   async #historyQuery(search, start, end) {
      this.setState({ isLoading: true });
      try {
         const results = await Application.#promisify(browser.history, 'search', {
            text: search,
            startTime: start.getTime(),
            endTime: end.getTime(),
            maxResults: Application.DEFAULTS.MAX_HISTORY_RESULTS,
         });
         this.#historyCallback(results, start, results.length);
      } catch (error) {
         console.error('History search error:', error);
         this.#displayError('Failed to load history.');
      } finally {
         this.setState({ isLoading: false });
      }
   }

   #historyCallback(rawResults, targetDayStart, totalApiResults) {
      const { pageItems } = this.options;
      const { itemsToRender, totalForPagination } = this.state.isSearching
         ? this.#handleSearchResults(rawResults, pageItems, totalApiResults)
         : this.#handleDayView(rawResults, pageItems, targetDayStart);

      this.#renderHistoryView(itemsToRender, totalForPagination);
   }

   #handleSearchResults(rawResults, itemsPerPage, totalApiResults) {
      const pageResults = this.#paginateResults(rawResults, this.state.currentPage, itemsPerPage);
      const groupedByDay = this.#groupResultsByDay(pageResults);

      return {
         itemsToRender: groupedByDay,
         totalForPagination: totalApiResults,
      };
   }

   #handleDayView(rawResults, itemsPerPage, targetDayStart) {
      const targetMoment = dayjs(targetDayStart);
      const filteredResults = rawResults.filter(result => dayjs(result.lastVisitTime).isSame(targetMoment, 'day'));
      const pageResults = this.#paginateResults(filteredResults, this.state.currentPage, itemsPerPage);
      const groupedByDay = this.#groupSingleDayResults(pageResults, targetMoment, filteredResults.length);

      return {
         itemsToRender: groupedByDay,
         totalForPagination: filteredResults.length,
      };
   }

   #paginateResults(items, currentPage, itemsPerPage) {
      if (!items?.length || itemsPerPage <= 0 || currentPage <= 0) return [];

      const pageIndex = currentPage - 1; // 0-based index
      const startIndex = pageIndex * itemsPerPage;
      return items.slice(startIndex, startIndex + itemsPerPage);
   }

   #groupResultsByDay(results) {
      return results.reduce((acc, result) => {
         const itemDayKey = Application.#getDayKey(result.lastVisitTime);
         (acc[itemDayKey] = acc[itemDayKey] || []).push(result);
         return acc;
      }, {});
   }

   #groupSingleDayResults(pageResults, targetMoment, totalResultsForDay) {
      const dayKey = Application.#getDayKey(targetMoment);
      const grouped = {};

      if (pageResults.length) {
         grouped[dayKey] = pageResults;
      } else if (this.state.currentPage === 1 && totalResultsForDay === 0) {
         grouped[dayKey] = [];
      }

      return grouped;
   }

   // DATA MANIPULATION

   async #historyEntryDelete(url, entryElement) {
      const container = entryElement.parentElement;
      entryElement.remove(); // Optimistic removal

      try {
         await Application.#promisify(browser.history, 'deleteUrl', { url });
         if (container?.classList.contains('history-day') && !container.querySelector(Application.SELECTORS.entry)) {
            const emptyMessage = `<div class="entry-empty">${browser.i18n.getMessage('history_date_empty')}</div>`;
            container.querySelector('h2')?.insertAdjacentHTML('afterend', emptyMessage);
         }
      } catch (error) {
         console.error(`Error deleting URL: ${url}`, error);
      } finally {
         this.#updateRemoveConfirmation();
      }
   }

   #removeSelectedEntries() {
      this.state.selectedUrls.forEach(url => {
         const entryElement = this.dom.contentContainer.querySelector(`.entry-link a[href="${CSS.escape(url)}"]`)?.closest('.entry');
         if (entryElement) this.#historyEntryDelete(url, entryElement);
      });
      this.clearSelectedItems();
   }

   // RENDERING & DOM MANIPULATION

   #renderHistoryView(items, totalResults) {
      this.#clearContent();
      const { contentContainer } = this.dom;

      if (this.state.isSearching) {
         const searchTitle = `<h1>${browser.i18n.getMessage('search_display')} '${Application.#escape(this.state.searchQuery)}'</h1>`;
         const messageKey = totalResults > 0 ? 'search_found' : 'search_empty';
         const searchMeta = `<div class="search-info">${browser.i18n.getMessage(messageKey, totalResults.toString())}</div>`;

         this.dom.contentContainer?.insertAdjacentHTML('beforeend', `<div class="search-header">${searchTitle}${searchMeta}</div>`);
      }

      const sortedDays = Object.entries(items).sort(([keyA], [keyB]) => +keyB - +keyA);
      const fragment = document.createDocumentFragment();

      sortedDays.forEach(([k, dayEntries]) => {
         const dayDiv = this.createDayElement(k, dayEntries, totalResults);
         fragment.append(dayDiv);
      });

      contentContainer.append(fragment);

      this.#insertPaginationControls(totalResults);

      if (this.#lastScrollPosition > 0 && contentContainer.parentElement) {
         contentContainer.parentElement.scrollTop = this.#lastScrollPosition;
         this.#lastScrollPosition = 0;
      }
   }

   #updateUIComponents() {
      this.dom.historyContainer?.classList.toggle('is-loading', this.state.isLoading);
      this.dom.historyContainer?.classList.toggle('is-searching', this.state.isSearching);

      this.dom.contentContainer.querySelectorAll(Application.SELECTORS.entry).forEach(entryElement => {
         const url = entryElement.querySelector(Application.SELECTORS.entryLink)?.href;
         if (url) {
            entryElement.classList.toggle('selected', this.state.selectedUrls.has(url));
         }
      });

      this.#updateRemoveConfirmation();
   }

   createDayElement(dateKey, dayEntries, totalResults) {
      const dayDiv = document.createElement('div');
      dayDiv.className = 'history-day';
      dayDiv.setAttribute('date', dateKey);

      const date = dayjs(+dateKey).toDate();
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
      } catch (err) {
         formattedDay = dayJsDate.format('D'); // Fallback
      }
      const finalFormattedDate = `${dayJsDate.format(baseDateFormat)} ${formattedDay}, ${dayJsDate.format(yearFormat)}`;
      const pageCountDisplay = this.state.isSearching ? '' : this.#getPageCountDisplay(totalResults);

      const h2 = document.createElement('h2');

      if (this.state.isSearching) {
         const dateLink = document.createElement('a');
         dateLink.href = '#';
         // dateLink.textContent = ${dayjs(date).format(dateFormat)};
         dateLink.textContent = finalFormattedDate;
         // end fix
         dateLink.title = browser.i18n.getMessage('history_go_to_date_title') || `Go to ${finalFormattedDate}`;
         dateLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.#calendar ? this.#calendar.selectDate(date) : this.historyGetDay(date);
         });
         h2.append(dateLink);
      }
      else {
         h2.textContent = finalFormattedDate;
      }

      const pageCountSpan = document.createElement('span');
      pageCountSpan.innerHTML = pageCountDisplay;

      h2.append(pageCountSpan);
      dayDiv.append(h2);

      if (dayEntries.length) {
         dayEntries.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
         dayEntries.forEach(entry => {
            dayDiv.insertAdjacentHTML('beforeend', this.#historyEntryFormat(entry));
         });
      }
      else {
         dayDiv.insertAdjacentHTML('beforeend', `<div class="entry-empty">${browser.i18n.getMessage('history_date_empty')}</div>`);
      }

      return dayDiv;
   }

   #historyEntryFormat(entry) {
      const timeFormat = this.options.use24HoursFormat ? 'HH:mm' : 'hh:mm A';
      const time = dayjs(entry.lastVisitTime).format(timeFormat);

      const originalUrl = entry.url;
      let title = Application.#escape(entry.title || originalUrl);
      const escapedDisplayUrl = Application.#escape(originalUrl);
      const favicon = this.#getFavicon(originalUrl);
      const { timeBeforeTitle } = this.options;

      if (this.state.isSearching && this.state.searchQuery) {
         const pattern = new RegExp(`(${this.#escapeRegExp(this.state.searchQuery)})`, 'gi');
         title = title.replace(pattern, `<mark>$1</mark>`);
      }

      return `
         <div class="entry">
            ${timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <img class="entry-icon" src="${favicon}" loading="lazy" alt=""/>
            <div class="entry-link"><a href="${originalUrl}" target="_blank" title="${escapedDisplayUrl}">${title}</a></div>
            ${!timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <a href="#" class="entry-remove" title="${browser.i18n.getMessage('history_remove_single')}">✕</a>
         </div>`;
   }

   #getPageCountDisplay(totalResults) {
      const { pageItems } = this.options;
      if (!totalResults || totalResults <= pageItems) return '';

      const currentPage = this.state.currentPage;
      const itemsShownSoFar = Math.min(currentPage * pageItems, totalResults);

      // Return empty string if only one page, otherwise format page info
      //    return totalPages <= 1
      //       ? totalResults.toString()
      //       // Show Page X / Y"
      //       : browser.i18n.getMessage('pagination_page_info', [this.state.currentPage.toString(), totalPages.toString()]);

      return `${itemsShownSoFar} / ${totalResults}`;
   }

   // --- Pagination & Scroll Restoration ---
   #insertPaginationControls(totalResults) {
      const { pageItems } = this.options;

      this.dom.historyContainer.querySelector('.pagination')?.remove();

      if (totalResults <= pageItems) return;

      const totalPages = Math.ceil(totalResults / pageItems);
      const paginationHTML = `
         <div class="pagination">
            <button id="${Application.SELECTORS.prevPageButton.slice(1)}" class="btn btn-secondary" ${this.state.currentPage <= 1 ? 'disabled' : ''}>
               ${browser.i18n.getMessage('pagination_prev')}
            </button>
            <span class="page-info">${this.#getPageCountDisplay(totalResults)}</span>
            <button id="${Application.SELECTORS.nextPageButton.slice(1)}" class="btn btn-secondary" ${this.state.currentPage >= totalPages ? 'disabled' : ''}>
               ${browser.i18n.getMessage('pagination_next')}
            </button>
         </div>`;

      this.dom.contentContainer.insertAdjacentHTML('afterend', paginationHTML);
      this.#bindPaginationControls(totalResults);
   }

   #bindPaginationControls(totalResults) {
      this.dom.prevPageButton = document.querySelector(Application.SELECTORS.prevPageButton);
      this.dom.nextPageButton = document.querySelector(Application.SELECTORS.nextPageButton);

      const handlePageChange = newPage => {
         this.#lastScrollPosition = this.dom.historyContainer?.scrollTop || 0; // Save scroll position
         this.setState({ currentPage: newPage });
         this.#reloadCurrentView();
      };

      this.dom.prevPageButton?.addEventListener('click', () => {
         if (this.state.currentPage > 1) handlePageChange(this.state.currentPage - 1);
      });
      this.dom.nextPageButton?.addEventListener('click', () => {
         const totalPages = Math.ceil(totalResults / this.options.pageItems);
         if (this.state.currentPage < totalPages) handlePageChange(this.state.currentPage + 1);
      });
   }

   // UI COMPONENT LOGIC (Calendar, Options, Selection, etc.)

   #initCalendar() {
      if (!this.dom.sidebarNavContent) {
         console.error('Calendar container not found or IonCalendar class is not defined');
         return;
      }

      const calendarElement = document.createElement('div');
      calendarElement.classList.add('calendar');
      this.dom.sidebarNavContent.prepend(calendarElement);

      if (typeof IonCalendar === 'undefined') {
         console.error('IonCalendar class is not defined');
         return;
      }

      const todayForCalendar = dayjs(this.#today);

      this.#calendar = new IonCalendar(calendarElement, {
         sundayFirst: this.options.sundayFirst,
         startDate: todayForCalendar,
         maxDate: todayForCalendar,
         yearRange: `${this.#now.getFullYear() - 3}-${this.#now.getFullYear()}`,
         format: 'dayjs',
         onClick: dateObject => {
            const date = dayjs.isDayjs(dateObject) ? dateObject.toDate() : dayjs(dateObject).toDate();
            if (dayjs(date).isValid()) {
               this.historyGetDay(date);
            }
            else {
               console.error('Invalid date received from calendar onClick:', dateObject);
            }
         }
      });
   }

   // --- Options Modal ---
   openOptions() {
      const { optionsForm, optionsModal } = this.dom;
      if (!optionsForm || !optionsModal) return;

      optionsForm.elements['use24HoursFormat'].checked = this.options.use24HoursFormat;
      optionsForm.elements['timeBeforeTitle'].checked = this.options.timeBeforeTitle;
      optionsForm.elements['sundayFirst'].checked = this.options.sundayFirst;
      optionsForm.elements['pageItems'].value = this.options.pageItems;

      optionsModal.showModal();
   }

   #saveOptions() {
      const { optionsForm } = this.dom;
      if (!optionsForm.checkValidity()) {
         optionsForm.reportValidity();
         return;
      }

      const formData = new FormData(optionsForm);
      const oldSundayFirst = this.options.sundayFirst;
      const settingsToSave = {
         use24HoursFormat: formData.has('use24HoursFormat'),
         timeBeforeTitle: formData.has('timeBeforeTitle'),
         sundayFirst: formData.has('sundayFirst'),
         pageItems: parseInt(formData.get('pageItems'), 10) || Application.DEFAULTS.PAGE_ITEMS,
      };

      browser.storage.sync.set(settingsToSave, () => {
         if (browser.runtime.lastError) {
            console.error('Error saving options:', browser.runtime.lastError);
            // TODO: Notify user of save error
         }
         else {
            this.options = { ...this.options, ...settingsToSave };

            if (this.#calendar && this.options.sundayFirst !== oldSundayFirst) {
               this.dom.calendar?.remove();
               this.#calendar = null;
               this.#initCalendar();
            }

            this.#reloadCurrentView();
         }
      });
   }

   clearSelectedItems() {
      if (this.state.selectedUrls.size > 0) {
         this.setState({ selectedUrls: new Set(), multiSelectLastUrl: null });
      }
   }

   selectAllEntries() {
      const entries = this.dom.contentContainer.querySelectorAll(Application.SELECTORS.entry);
      const allUrls = new Set();
      let lastUrl = null;

      entries.forEach(entry => {
         const url = entry.querySelector(Application.SELECTORS.entryLink)?.href;
         if (url) {
            allUrls.add(url);
            lastUrl = url;
         }
      });

      this.setState({
         selectedUrls: allUrls,
         multiSelectLastUrl: lastUrl
      });
   }

   #multiSelectRange(endUrl) {
      const { multiSelectLastUrl } = this.state;
      const entries = Array.from(this.dom.contentContainer.querySelectorAll(Application.SELECTORS.entry));

      const urlsInOrder = entries.map(entry => entry.querySelector(Application.SELECTORS.entryLink)?.href);

      const startIndex = urlsInOrder.indexOf(multiSelectLastUrl);
      const endIndex = urlsInOrder.indexOf(endUrl);

      if (startIndex === -1 || endIndex === -1) {
         console.warn('Multi-select failed: start or end entry not found in DOM list');
         return [];
      }

      const [start, end] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
      return urlsInOrder.slice(start, end + 1);
   }

   // --- Remove Confirmation ---
   #updateRemoveConfirmation() {
      const { removeConfirmation } = this.dom;
      if (!removeConfirmation) return;

      const selectedCount = this.state.selectedUrls.size;
      const numElement = removeConfirmation.querySelector('.num');

      removeConfirmation.classList.toggle('is-visible', selectedCount > 0);
      if (selectedCount > 0 && numElement) {
         numElement.textContent = selectedCount.toString();
      }
   }

   // SEARCH LOGIC
   inputSearch() {
      const { searchInput, searchClear } = this.dom;
      const searchQuery = searchInput.value;

      searchClear.style.display = searchQuery ? 'flex' : 'none';

      if (searchQuery) {
         this.#throttleSearch(searchQuery);
      }
      else {
         this.#resetSearch();
      }
   }

   #resetSearch() {
      this.#throttleSearch?.cancel();
      this.setState({ isSearching: false, searchQuery: '' });
      if (this.dom.searchInput) this.dom.searchInput.value = '';
      if (this.dom.searchClear) this.dom.searchClear.style.display = 'none';
      // TODO (UX): Instead of reloading the day view, consider just clearing the results.
      this.historyGetDay(this.state.currentDay || this.#today);
   }

   #highlightText(target, keyword) {
      if (!target || !keyword) return;

      const content = target.innerText;
      const pattern = new RegExp(`(${this.#escapeRegExp(keyword)})`, 'gi');

      if (content.match(pattern)) {
         target.innerHTML = content.replace(pattern, `<mark>$1</mark>`);
      }
   }

   // INTERNAL HELPERS & UTILITIES

   #cacheDOMElements() {
      const S = Application.SELECTORS;
      this.dom = {
         // Containers
         historyContainer: document.querySelector(S.historyContainer),
         contentContainer: document.querySelector(S.contentContainer),
         sidebarNavContent: document.querySelector(S.sidebarNavContent),

         // Navigation
         goToday: document.querySelector(S.goToday),
         goHistory: document.querySelector(S.goHistory),
         goOptions: document.querySelector(S.goOptions),

         // Search
         searchInput: document.querySelector(S.searchInput),
         searchClear: document.querySelector(S.searchClear),

         // Settings modal
         optionsModal: document.querySelector(S.optionsModal),
         optionsForm: document.querySelector(S.optionsForm),
         optionsClose: document.querySelector(S.optionsClose),

         // Delete confirmation modal
         removeConfirmation: document.querySelector(S.removeConfirmation),
         confirmButton: document.querySelector(S.confirmButton),
         cancelButton: document.querySelector(S.cancelButton),
      };

      // Search container is optional
      if (this.dom.searchInput) {
         this.dom.searchContainer = this.dom.searchInput.closest(S.searchContainer);
      }

      // Pagination buttons are set dynamically
      this.dom.prevPageButton = null;
      this.dom.nextPageButton = null;
   }

   #refreshTime() {
      this.#now = new Date(); // Current time
      this.#today = Application.#getToday();
   }

   #setOptions(items, defaultSundayFirst) {
      // this.options.use24HoursFormat = items.use24HoursFormat ?? true;
      // this.options.timeBeforeTitle = items.timeBeforeTitle ?? false;
      // this.options.sundayFirst = items.sundayFirst ?? defaultSundayFirst;
      this.options.use24HoursFormat = (items.use24HoursFormat == null) ? true : items.use24HoursFormat;
      this.options.timeBeforeTitle = (items.timeBeforeTitle == null) ? false : items.timeBeforeTitle;
      this.options.sundayFirst = (items.sundayFirst == null) ? defaultSundayFirst : items.sundayFirst;
      this.options.pageItems = +items.pageItems || 1000;
   }

   #reloadCurrentView() {
      const { isSearching, searchQuery, currentDay } = this.state;
      const queryParams = isSearching
         ? { search: searchQuery, start: dayjs(0).toDate(), end: dayjs(this.#today).endOf('day').toDate() }
         : { search: '', start: dayjs(currentDay || this.#today).startOf('day').toDate(), end: dayjs(currentDay || this.#today).endOf('day').toDate() };

      this.#historyQuery(queryParams.search, queryParams.start, queryParams.end);
   }

   #getFavicon(url) {
      try {
         new URL(url); // Validate URL structure
         // Use extension API (works in Chrome/Firefox within extension context)
         return (typeof chrome !== 'undefined')
            ? `chrome-extension://${browser.runtime.id}/_favicon/?size=16&pageUrl=${encodeURIComponent(Application.#escape(url))}` // chrome like
            : `chrome://favicon/size/16@2x/${url}`; // Firefox
      } catch (err) {
         console.warn("Invalid URL for favicon:", url, err);
         return '/icons/default_favicon.png'; // Path to default icon in extension
      }
   }

   #clearContent() {
      if (this.dom.contentContainer) this.dom.contentContainer.textContent = '';
   }

   #displayError(message) {
      this.#clearContent();
      this.dom.contentContainer?.insertAdjacentHTML('beforeend', `<div class="error-message">${Application.#escape(message)}</div>`);
   }

   // Return non-strings as is; basic HTML escaping for strings
   #escapeRegExp(str) {
      return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
   }

   // --- Static Helpers ---

   static #getToday() {
      return dayjs().startOf('day').toDate(); // Returns a Date object for 00:00:00 today
   }

   static #getDayKey(time) {
      return dayjs(time).startOf('day').valueOf().toString();
   }

   static #escape(string) {
      return typeof string !== 'string' ? string : string
         .replace(/</g, '&#x3C;')
         .replace(/>/g, '&#x3E;')
         .replace(/"/g, '&quot;')
         .replace(/'/g, '&#039;');
   }

   static #debounce(func, wait) {
      let timeout;
      const debouncedFunction = function (...args) {
         const context = this;
         clearTimeout(timeout);
         timeout = setTimeout(() => func.apply(context, args), wait);
      };
      debouncedFunction.cancel = () => clearTimeout(timeout);
      return debouncedFunction;
   }

   static #i18n() {
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

   static #getCurrentLocale() {
      return browser.i18n.getMessage('language') || 'en';
   }

   static #promisify(api, method, ...args) {
      return new Promise((resolve, reject) => {
         api[method](...args, result => {
            if (browser.runtime.lastError) return reject(browser.runtime.lastError);
            resolve(result);
         });
      });
   }
}

// Initialize App when DOM is ready
(document.readyState === 'interactive' || document.readyState === 'complete')
   ? new Application()
   : window.addEventListener('DOMContentLoaded', () => new Application());

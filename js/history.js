class Application {
   constructor() {
      this.KEYS = { A: 65 };
      this.now = new Date();
      this.options = {
         use24HoursFormat: true,
         timeBeforeTitle: false,
         sundayFirst: moment.localeData().firstDayOfWeek() === 0,
         // popupNbItems: 10
      };
      this.today = null;
      this.isSearching = false;
      this.isLoading = false;
      this.autoFocus = false;
      this.trottleSearch = null;
      this.controlPressed = false;
      this.majPressed = false;
      this.multiSelectLastEntry = null;

      this.init();
   }

   init() {
      this.i18n();
      this.today = new Date(this.now.getFullYear(), this.now.getMonth(), this.now.getDate(), 0, 0, 0, 0);

      chrome.storage.sync.get(items => {
         this.options.use24HoursFormat = items.use24HoursFormat === undefined ? true : items.use24HoursFormat;
         this.options.timeBeforeTitle = items.timeBeforeTitle === undefined ? false : items.timeBeforeTitle;
         this.options.sundayFirst = items.sundayFirst === undefined ? false : items.sundayFirst;
         // this.options.popupNbItems = items.popupNbItems === undefined ? 10 : items.popupNbItems;

         if (document.body.classList.contains('popup')) {
            this.initPopup();
         }
         else {
            this.initMain();
         }
      });
   }

   initPopup() {
      this.historyGetDay(this.today, this.options.popupNbItems);

      document.getElementById('go_history').addEventListener('click', e => {
         e.preventDefault();
         chrome.runtime.sendMessage({ command: 'open-history-page' }, console.log);
      });
   }

   initMain() {
      this.trottleSearch = _.debounce(this.historySearch, 500);

      const goOptions = document.getElementById('go_options');
      const optionsCancel = document.getElementById('options_cancel');
      const optionsClose = document.getElementById('options_close');
      const optionsSave = document.getElementById('options_save');
      const searchInput = document.getElementById('search_input');
      const searchClear = document.getElementById('search_clear');

      goOptions.addEventListener('click', () => this.openOptions());
      optionsCancel.addEventListener('click', () => this.closeOptions());
      optionsClose.addEventListener('click', () => this.closeOptions());
      optionsSave.addEventListener('click', () => this.saveOptions());

      searchInput.addEventListener('focusin', () => searchInput.parentElement.classList.add('focus'));
      searchInput.addEventListener('focusout', () => searchInput.parentElement.classList.remove('focus'));
      searchInput.addEventListener('keyup', () => this.inputSearch());

      searchClear.addEventListener('click', e => {
         e.preventDefault();
         this.clearSearch();
      });

      this.initCalendar();

      document.getElementById('go_today').addEventListener('click', e => {
         e.preventDefault();
         this.historyGetDay(this.today);
      });

      document.getElementById('clear_confirm').addEventListener('click', e => {
         e.preventDefault();
         this.removeSelectedEntires();
      });

      document.getElementById('clear_cancel').addEventListener('click', e => {
         e.preventDefault();
         this.clearSelectedItems();
      });

      document.addEventListener('keydown', e => {
         if (e.which === 17) this.controlPressed = true;
         else if (e.which === 16) this.majPressed = true;
         else this.keypressMulti(e);
      });

      document.addEventListener('keyup', e => {
         if (e.which === 17) this.controlPressed = false;
         else if (e.which === 16) this.majPressed = false;
      });

      document.addEventListener('click', e => {
         if (!e.target.closest('.entry') && !e.target.closest('.remove-confirmation')) {
            this.clearSelectedItems();
         }
      });

      searchInput.focus();
      this.historyGetDay(this.today);
   }

   initCalendar() {
      // const calendar = document.createElement('div');
      //   calendar.classList.add('calendar');
      //   document.querySelector('.sidebar .nav .content').prepend(calendar);

      const calendar = $('<div />').addClass('calendar');
      $('.sidebar .nav .content').prepend(calendar);

      calendar.ionCalendar({
         lang: this.getCurrentLocale(),
         // sundayFirst: moment.localeData().firstDayOfWeek() == 0,
         sundayFirst: Boolean(this.options.sundayFirst),
         startDate: this.today,
         maxDate: this.today,
         // maxDate: moment('2024-09-12'),
         years: (this.now.getFullYear() - 3) + '-' + this.now.getFullYear(),
         onClick: date => this.historyGetDay(new Date(date))
      });
   }

   inputSearch() {
      const searchQuery = document.getElementById('search_input').value;
      const searchClear = document.getElementById('search_clear');

      if (searchQuery) {
         searchClear.style.display = 'flex';
         this.trottleSearch(searchQuery);
      }
      else {
         if (this.isSearching) {
            this.clearContent();
            this.historyGetDay(this.today);
         }
         this.trottleSearch.cancel();
         this.isSearching = false;
         searchClear.style.display = 'none';
      }
   }

   clearSearch() {
      document.getElementById('search_input').value = '';
      this.inputSearch();
   }

   historySearch(query) {
      this.isSearching = true;
      this.clearContent();
      this.historyQuery(query, new Date(1970, 1, 1), new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate(), 23, 59, 59), 0);
   }

   historyGetDay(day, nbEntries = 0) {
      if (day > this.now) return;

      const dateStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
      const dateEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);

      this.clearContent();
      this.historyQuery('', dateStart, dateEnd, nbEntries);
   }

   historyQuery(search, start, end, nbEntries) {
      this.isLoading = false;

      chrome.history.search({
         text: search,
         startTime: start.getTime(),
         endTime: end.getTime(),
         maxResults: nbEntries
      }, results => {
         this.historyCallback(results, start, end);
      });
   }

   historyCallback(results, start, end) {
      const items = {};
      let count = 0;

      results.forEach(result => {
         const itemDate = new Date(result.lastVisitTime);

         if (itemDate >= start && itemDate <= end) {
            const itemKey = itemDate.setHours(0, 0, 0, 0).toString();

            if (!items[itemKey]) {
               items[itemKey] = [];
            }
            items[itemKey].push(result);
            count++;
         }
      });

      if (Object.keys(items).length === 0) {
         items[start.getTime()] = {};
      }

      this.historyFormatDays(items, count);
   }

   historyFormatDays(items, count) {
      this.clearContent();

      if (this.isSearching) {
         this.insertContent(`<h1>${chrome.i18n.getMessage('search_display')} "${document.getElementById('search_input').value}"</h1>`);

         if (count > 0) {
            this.insertContent(`<div class="search-result">${chrome.i18n.getMessage('search_found', count.toString())}</div>`);
         }
         else {
            this.insertContent(`<div class="search-result">${chrome.i18n.getMessage('search_empty')}</div>`);
            this.isLoading = false;
            return;
         }
      }

      Object.entries(items).forEach(([k, day]) => {
         const date = new Date(parseFloat(k));
         const selector = `.history-container [date="${k}"]`;
         let html = document.querySelector(selector) ? '' : `<div class="history-day" date="${k}">`;

         html += `<h2>${moment(date).format(chrome.i18n.getMessage('date_format'))}</h2>`;

         if (day.length) {
            day.forEach(entry => {
               html += this.historyEntryFormat(entry);
            });
         }
         else {
            html += `<div class="entry-empty">${chrome.i18n.getMessage('history_date_empty')}</div>`;
         }

         if (document.querySelector(selector) === null) {
            html += '</div>';
         }

         this.insertContent(html);
      });

      this.historyEntriesBind();
      this.isLoading = false;
   }

   historyEntryFormat(entry) {
      const timeFormat = this.options.use24HoursFormat ? 'HH:mm' : 'hh:mm A';
      const time = moment(new Date(entry.lastVisitTime)).format(timeFormat);
      const title = this.escape(entry.title || entry.url);
      const url = this.escape(entry.url);
      const favicon = this.getFavicon(entry.url);

      return `
         <div class="entry">
            ${this.options.timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <img class="entry-icon" src="${favicon}" />
            <div class="entry-link"><a href="${url}" target="_blank" title="${url}">${title}</a></div>
            ${!this.options.timeBeforeTitle ? `<div class="entry-time">${time}</div>` : ''}
            <a class="entry-remove" title="${chrome.i18n.getMessage('history_remove_single')}">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" width="12px" height="12px" slot="before">
                  <path d="M14.1016 1.60156L8.20312 7.5L14.1016 13.3984L13.3984 14.1016L7.5 8.20312L1.60156 14.1016L0.898438 13.3984L6.79688 7.5L0.898438 1.60156L1.60156 0.898438L7.5 6.79688L13.3984 0.898438L14.1016 1.60156Z" />
               </svg>
            </a>
         </div>
      `;
   }

   historyEntryDelete(url, sender) {
      const container = sender.parentElement;
      sender.remove();

      chrome.history.deleteUrl({ url: url }, () => {
         if (container.querySelectorAll('.entry').length === 0) {
            this.insertContent(`<div class="entry-empty">${chrome.i18n.getMessage('history_date_empty')}</div>`, container);
         }

         this.updateConfirm();
      });
   }

   historyEntriesBind() {
      document.querySelectorAll('.history-container .entry').forEach(entry => {
         const removeButton = entry.querySelector('.entry-remove');
         removeButton.addEventListener('click', e => {
            e.preventDefault();
            this.historyEntryDelete(entry.querySelector('.entry-link a').href, entry);
         });

         entry.addEventListener('click', e => {
            if (!e.target.closest('a') && !e.target.closest('.entry-remove')) {
               e.preventDefault();
               this.toggleSelection(entry);
               this.updateConfirm();
            }
         });
      });
   }

   toggleSelection(entry) {
      if (this.majPressed && this.multiSelectLastEntry) {
         const entries = document.querySelectorAll('.history-container .entry');
         const startIndex = Array.from(entries).indexOf(this.multiSelectLastEntry);
         const endIndex = Array.from(entries).indexOf(entry);
         const range = startIndex < endIndex ? entries.slice(startIndex, endIndex + 1) : entries.slice(endIndex, startIndex + 1);
         range.forEach(e => e.classList.add('selected'));
      } else {
         this.multiSelectLastEntry = entry;
         entry.classList.toggle('selected');
      }
   }

   keypressMulti(e) {
      if (e.target.id !== 'search_input') {
         if (this.controlPressed && e.which === this.KEYS.A) {
            e.preventDefault();
            document.querySelectorAll('.history-container .entry').forEach(entry => entry.classList.add('selected'));
            this.updateConfirm();
         }
      }

      if (e.which === 46) {
         if (document.querySelectorAll('.history-container .entry.selected').length) {
            this.removeSelectedEntires();
         }
      }
   }

   updateConfirm() {
      const count = document.querySelectorAll('.history-container .entry.selected').length;

      if (count > 0) {
         document.querySelector('.remove-confirmation').style.display = 'flex';
         document.querySelector('.remove-confirmation .num').textContent = count.toString();
      }
      else {
         document.querySelector('.remove-confirmation').style.display = 'none';
      }
   }

   clearSelectedItems() {
      document.querySelectorAll('.history-container .entry.selected').forEach(entry => entry.classList.remove('selected'));
      this.multiSelectLastEntry = null;
      this.updateConfirm();
   }

   removeSelectedEntires() {
      document.querySelectorAll('.history-container .entry.selected').forEach(entry => {
         entry.querySelector('.entry-remove').click();
      });
   }

   insertContent(html, context = null) {
      const target = context || document.querySelector('.history-container .content');
      target.insertAdjacentHTML('beforeend', html);
   }

   clearContent() {
      document.querySelector('.history-container .content').innerHTML = '';
   }

   i18n() {
      document.querySelectorAll('[i18n]').forEach(element => {
         const i18n = element.getAttribute('i18n');
         if (i18n.includes(':')) {
            const [attr, message] = i18n.split(':');
            element.setAttribute(attr, chrome.i18n.getMessage(message));
         }
         else {
            element.textContent = chrome.i18n.getMessage(i18n);
         }
      });
   }

   is(target, classname) {
      return target.classList.contains(classname) || target.closest(`.${classname}`) !== null;
   }

   getCurrentLanguage() {
      return this.getCurrentLocale().slice(0, 2);
   }

   getCurrentLocale() {
      return chrome.i18n.getMessage('language');
   }

   getFavicon(url) {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?size=16&pageUrl=${encodeURIComponent(this.escape(url))}`;
   }

   openOptions() {
      document.getElementById('options_field_24hoursformat').checked = this.options.use24HoursFormat;
      document.getElementById('options_field_displaytitlebeforetime').checked = this.options.timeBeforeTitle;
      document.getElementById('options_field_displaysundayfirst').checked = this.options.sundayFirst;
      // document.getElementById('options_field_popupnbitems').value = this.options.popupNbItems;
      document.getElementById('modal_options').style.display = 'flex';
   }

   closeOptions(reload = false) {
      document.getElementById('modal_options').style.display = 'none';
      if (reload) location.reload();
   }

   saveOptions() {
      chrome.storage.sync.set({
         use24HoursFormat: document.getElementById('options_field_24hoursformat').checked,
         timeBeforeTitle: document.getElementById('options_field_displaytitlebeforetime').checked,
         sundayFirst: document.getElementById('options_field_displaysundayfirst').checked,
         // popupNbItems: document.getElementById('options_field_popupnbitems').value
      }, () => this.closeOptions(true));
   }

   escape(string) {
      return string
         .replace(/</g, '&#x3C;')
         .replace(/>/g, '&#x3E;')
         .replace(/'/g, '&quot;')
         .replace(/'/g, '&#039;');
   }
}

window.addEventListener('DOMContentLoaded', () => new Application());

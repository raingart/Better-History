/**
 * Ion.Calendar v4.0
 * GitHub page: https://github.com/raingart/ion.calendar
*/

// import dayjs from 'dayjs';
// import customParseFormat from 'dayjs/plugin/customParseFormat';
// import localizedFormat from 'dayjs/plugin/localizedFormat';
// import localeData from 'dayjs/plugin/localeData';
// import 'dayjs/locale/en';

// dayjs.extend(customParseFormat);
// dayjs.extend(localizedFormat);
// dayjs.extend(localeData);
// CSS Class Constants
const CSS = {
   CONTAINER: 'ic__container',
   HEADER: 'ic__header',
   PREV: 'ic__prev',
   NEXT: 'ic__next',
   MONTH_WRAP: 'ic__month',
   YEAR_WRAP: 'ic__year',
   MONTH_SELECT: 'ic__month-select',
   YEAR_SELECT: 'ic__year-select',
   WEEK_HEAD: 'ic__week-head',
   DAY: 'ic__day',
   DAY_EMPTY: 'ic__day-empty',
   DISABLED: 'disabled',
   // ... add other classes
};

class IonCalendar {
   #element;
   #settings;
   #timeNow;       // Current actual time (Dayjs object)
   #timeNowLocal;  // Currently viewed month/year (Dayjs object)
   #timeSelected;  // Selected date (Dayjs object, null if none)
   #maxDateObject = null; // Max allowed date (Dayjs object, end of day)
   #eventHandlers = []; // Stores event handlers for removal
   fromYear; // Minimum allowed year
   toYear;   // Maximum allowed year

   constructor(element, options = {}) {
      this.#element = element;
      this.#settings = { ...this.defaultSettings, ...options };

      try {
         dayjs.locale(this.#settings.lang);
      } catch (e) {
         console.warn(`Day.js locale '${this.#settings.lang}' not loaded. Falling back to 'en'.`);
         dayjs.locale('en');
         this.#settings.lang = 'en';
      }

      this.#timeNow = dayjs();
      this.#timeNowLocal = dayjs();

      this.init();
   }

   get defaultSettings() {
      return {
         cutByWeek: true,
         sundayFirst: false,
         startDate: '',
         yearRange: '4',
         maxDate: '',
         format: 'L',
         daysInWeek: 7,
         emptyCell: '&nbsp;',
         hideArrows: false,
         clickable: true,
         onClick: null,
         onReady: null
      };
   }

   init() {
      if (this.#element.dataset.isActive) return;
      this.#element.dataset.isActive = true;

      this.#prepareData(); // Prepare initial date, year range, max date
      this.#renderCalendar();
      this.#attachEvents();
      this.#onReadyFnCallback();
   }

   updateData(options) {
      if (options.lang && options.lang !== this.#settings.lang) {
         try {
            dayjs.locale(options.lang);
         } catch (e) {
            console.warn(`Day.js locale '${options.lang}' not loaded. Falling back to current '${this.#settings.lang}'.`);
            options.lang = this.#settings.lang;
         }
      }
      const maxDateChanged = options.maxDate !== undefined && options.maxDate !== this.#settings.maxDate;

      this.#settings = { ...this.#settings, ...options };
      if (maxDateChanged) this.#setMaxDateInternal();
      this.updateCalendar();
   }

   updateCalendar() {
      // Remove previous listeners before clearing HTML
      this.#removeEvents();
      this.#element.innerHTML = '';
      this.#renderCalendar();
      this.#attachEvents();
   }

   destroy() {
      this.#removeEvents();
      this.#element.innerHTML = '';
      delete this.#element.dataset.isActive;
      // Optional: Nullify references if needed for complex scenarios
      // this.#element = null;
      // this.#settings = null;
      // ...
      console.log('IonCalendar instance destroyed.');
   }

   #prepareData() {
      this.#timeSelected = this.#parseStartDate(this.#settings.startDate);
      if (this.#timeSelected && this.#timeSelected.isValid()) {
         this.#timeNowLocal = this.#timeSelected.clone();
      }
      else {
         this.#timeNowLocal = dayjs();
      }
      [this.fromYear, this.toYear] = this.#parseYears(this.#settings.yearRange);
      this.#setMaxDateInternal(); // Parse and set maxDate object
   }

   #parseStartDate(startDate) {
      if (!startDate) return null;
      const format = this.#settings.format;
      const parsedDate = dayjs(startDate, format, this.#settings.lang);
      return parsedDate.isValid() ? parsedDate : null;
   }

   #parseYears(years) {
      const tempYears = years.split('-');
      const currentYear = dayjs().year();
      const fromYear = tempYears.length === 1
         ? dayjs().subtract(parseInt(tempYears[0]), 'years').year()
         : parseInt(tempYears[0]);
      const toYear = tempYears.length === 2
         ? parseInt(tempYears[1])
         : currentYear;
      return [fromYear, toYear];
   }

   #setMaxDateInternal() {
      this.#maxDateObject = null;
      if (!this.#settings.maxDate) return;

      // Attempt parsing with common formats
      const formats = ['L', 'YYYY-MM-DD', 'YYYY.MM.DD', 'DD.MM.YYYY'];
      let parsedMaxDate = null;

      for (const format of formats) {
         const parsed = dayjs(this.#settings.maxDate, format, this.#settings.lang);
         if (parsed.isValid()) {
            parsedMaxDate = parsed;
            break;
         }
      }

      if (parsedMaxDate) {
         this.#maxDateObject = parsedMaxDate.endOf('day'); // Store as end of day for comparison
      }
      else {
         console.error('Invalid maximum date format or CustomParseFormat plugin missing:', this.#settings.maxDate);
      }
   }

   #renderCalendar() {
      // Note: #getDays() implementation is missing
      this.#element.innerHTML = `
         <div class="${CSS.CONTAINER}">
            <div class="${CSS.HEADER}">
               <div class="${CSS.PREV}"><div></div></div>
               <div class="${CSS.NEXT}"><div></div></div>
               <div class="${CSS.MONTH_WRAP}">${this.#getMonthOptions(this.#timeNowLocal)}</div>
               <div class="${CSS.YEAR_WRAP}">${this.#getYearOptions(this.#timeNowLocal)}</div>
            </div>
            ${this.#getWeekHeader()}
            ${this.#getDays()}
         </div>`;
   }

   #getMonthOptions(timeForWork) {
      let options = '';
      const monthNames = dayjs.months();
      const currentMonth = timeForWork.month();
      const currentYear = timeForWork.year();
      // Determine max month to show based on maxDateObject
      const maxMonthInMaxYear = this.#maxDateObject ? this.#maxDateObject.month() : 11;
      const isMaxYear = this.#maxDateObject ? currentYear === this.#maxDateObject.year() : false;

      for (let i = 0; i < 12; i++) {
         if (isMaxYear && i > maxMonthInMaxYear) break;
         options += `<option value="${i}" ${i === currentMonth ? 'selected' : ''}>${monthNames[i]}</option>`;
      }
      return `<select class="${CSS.MONTH_SELECT}">${options}</select>`;
   }

   #getYearOptions(timeForWork) {
      let options = '';
      const currentYear = timeForWork.year();
      // Determine max year to show based on maxDateObject or toYear setting
      const maxYearToShow = this.#maxDateObject ? this.#maxDateObject.year() : this.toYear;

      for (let i = this.fromYear; i <= this.toYear; i++) {
         if (i > maxYearToShow) break; // Don't show years beyond maxYearToShow
         options += `<option value="${i}" ${i === currentYear ? 'selected' : ''}>${i}</option>`;
      }
      return `<select class="${CSS.YEAR_SELECT}">${options}</select>`;
   }

   #getWeekHeader() {
      const weekdaysShort = dayjs.localeData().weekdaysShort();
      let htmlCells = [];
      const daysCount = this.#settings.daysInWeek;

      if (this.#settings.sundayFirst) {
         htmlCells = weekdaysShort.map(day => `<td>${day}</td>`);
      }
      // Reorder for Monday first
      else {
         const mondayFirst = [...weekdaysShort.slice(1), weekdaysShort[0]];
         htmlCells = mondayFirst.map(day => `<td>${day}</td>`);
      }
      // Use only the required number of days
      htmlCells = htmlCells.slice(0, daysCount).join('');

      return `<table class="${CSS.WEEK_HEAD}"><tbody><tr>${htmlCells}</tr></tbody></table>`;
   }

   #getDays() {
      const currentViewDate = this.#timeNowLocal;
      const monthStart = currentViewDate.startOf('month');
      const monthEnd = currentViewDate.endOf('month');
      const daysInMonth = monthEnd.date();
      const daysInWeek = this.#settings.daysInWeek;
      const emptyCellHtml = `<td class="${CSS.DAY_EMPTY}">${this.#settings.emptyCell}</td>`;

      // Calculate starting day index
      const firstDayOfMonth = monthStart.day(); // 0=Sun, 6=Sat
      const adjustedFirstDayIndex = this.#settings.sundayFirst
         ? firstDayOfMonth
         : (firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1);

      // Create empty cells for the beginning of the week
      const leadingEmptyCells = Array.from({ length: adjustedFirstDayIndex }, () => emptyCellHtml);

      // Generate day cells
      const dayCells = [];
      for (let i = 1; i <= daysInMonth; i++) {
         const dayDate = currentViewDate.date(i);
         const isToday = dayDate.isSame(this.#timeNow, 'day');
         const isSelected = this.#isSelectedDay(dayDate);
         const isDisabled = this.#isMaxDay(dayDate);

         // Stop if disabled and cutByWeek is enabled
         if (isDisabled && this.#settings.cutByWeek) {
            break;
         }

         // Build day cell classes
         const classes = [CSS.DAY];
         if (isToday) classes.push('ic__day_state_current');
         if (isSelected) classes.push('ic__day_state_selected');
         if (isDisabled) classes.push(CSS.DISABLED);

         // Create HTML string for the day cell
         const dayCellHtml = `<td class="${classes.join(' ')}" data-day="${i}">${i}</td>`;
         dayCells.push(dayCellHtml);
      }

      // Add trailing empty cells if needed
      const totalDayCells = leadingEmptyCells.length + dayCells.length;
      const trailingEmptyCellsNeeded = (daysInWeek - (totalDayCells % daysInWeek)) % daysInWeek;
      const trailingEmptyCells = Array.from({ length: trailingEmptyCellsNeeded }, () => emptyCellHtml);

      // Combine all cells
      const allCells = [...leadingEmptyCells, ...dayCells, ...trailingEmptyCells];

      // Build table structure
      let tbodyContent = '';
      for (let i = 0; i < allCells.length; i += daysInWeek) {
         tbodyContent += `<tr>${allCells.slice(i, i + daysInWeek).join('')}</tr>`;
      }

      return `<table class='ic__days'><tbody>${tbodyContent}</tbody></table>`;
   }
   #attachEvents() {
      this.#removeEvents(); // Ensure no duplicate listeners

      const handlers = []; // Stores added handlers for removal

      // Helper to add event listener and store handler for removal
      const addHandler = (element, eventType, handler) => {
         if (element) {
            const boundHandler = handler.bind(this);
            element.addEventListener(eventType, boundHandler);
            handlers.push({ element, eventType, boundHandler });
         }
      };

      const $prev = this.#element.querySelector(`.${CSS.PREV}`);
      const $next = this.#element.querySelector(`.${CSS.NEXT}`);
      const $month = this.#element.querySelector(`.${CSS.MONTH_SELECT}`);
      const $year = this.#element.querySelector(`.${CSS.YEAR_SELECT}`);
      // Query days *after* render, excluding empty cells
      const $days = this.#element.querySelectorAll(`.${CSS.DAY}:not(.${CSS.DAY_EMPTY})`);

      if (this.#settings.hideArrows) {
         if ($prev) $prev.style.display = 'none';
         if ($next) $next.style.display = 'none';
      }
      else {
         addHandler($prev, 'click', this.#onPrevClick);
         addHandler($next, 'click', this.#onNextClick);
         this.#updateNavButtonsState(); // Update state after adding listeners
      }

      addHandler($month, 'change', this.#onMonthChange);
      addHandler($year, 'change', this.#onYearChange);

      if (this.#settings.clickable && $days.length) {
         $days.forEach(day => {
            // Add listener for each day (event delegation alternative)
            addHandler(day, 'click', this.#onDayClick);
         });
      }

      this.#eventHandlers = handlers; // Store new handlers
   }

   #removeEvents() {
      this.#eventHandlers.forEach(({ element, eventType, boundHandler }) => {
         element.removeEventListener(eventType, boundHandler);
      });
      this.#eventHandlers = []; // Clear the array
   }

   #updateNavButtonsState() {
      const $prev = this.#element.querySelector(`.${CSS.PREV}`);
      const $next = this.#element.querySelector(`.${CSS.NEXT}`);
      if (!$prev || !$next) return;

      const prevMonthToCheck = this.#timeNowLocal.subtract(1, 'month');
      // Disable prev if year before target month is less than fromYear
      const isPrevDisabled = prevMonthToCheck.year() < this.fromYear;
      $prev.classList.toggle(CSS.DISABLED, isPrevDisabled);

      let isNextDisabled = false;
      // Disable next if start of next month is after maxDateObject
      if (this.#maxDateObject) {
         const nextMonthToCheck = this.#timeNowLocal.add(1, 'month');
         isNextDisabled = nextMonthToCheck.startOf('month').isAfter(this.#maxDateObject);
      }
      // Disable next if year after target month exceeds toYear
      else {
         const nextMonthToCheck = this.#timeNowLocal.add(1, 'month');
         isNextDisabled = nextMonthToCheck.year() > this.toYear;
      }
      $next.classList.toggle(CSS.DISABLED, isNextDisabled);
   }

   #onPrevClick(e) {
      e.preventDefault();
      if (e.currentTarget.classList.contains(CSS.DISABLED)) return;
      this.#timeNowLocal = this.#timeNowLocal.subtract(1, 'months');
      this.updateCalendar();
   }

   #onNextClick(e) {
      e.preventDefault();
      if (e.currentTarget.classList.contains(CSS.DISABLED)) return;
      this.#timeNowLocal = this.#timeNowLocal.add(1, 'months');
      this.updateCalendar();
   }

   #onMonthChange(e) {
      e.preventDefault();
      const toMonth = parseInt(e.target.value);
      const currentYear = this.#timeNowLocal.year();
      let newDate = this.#timeNowLocal.month(toMonth);

      // Adjust date if the new month/year exceeds maxDate
      if (this.#maxDateObject && newDate.startOf('month').isAfter(this.#maxDateObject)) {
         // Try setting month in current year, then clamp to maxDate's month/year if still after.
         newDate = this.#maxDateObject.clone().year(currentYear).startOf('month');
         if (newDate.isAfter(this.#maxDateObject)) { // Still after? Clamp directly.
            newDate = this.#maxDateObject.clone().startOf('month');
         }
      }
      this.#timeNowLocal = newDate;
      this.updateCalendar();
   }

   #onYearChange(e) {
      e.preventDefault();
      const toYear = parseInt(e.target.value);
      const currentMonth = this.#timeNowLocal.month();
      let newDate = this.#timeNowLocal.year(toYear);

      // Adjust year if new year exceeds maxDate's year
      if (this.#maxDateObject && newDate.startOf('year').isAfter(this.#maxDateObject)) {
         // Clamp to the start of the maxDate's year
         newDate = this.#maxDateObject.clone().startOf('year');
      }

      // Clamp month if new year is maxYear and current month is past maxDate's month
      if (this.#maxDateObject && newDate.year() === this.#maxDateObject.year() && currentMonth > this.#maxDateObject.month()) {
         newDate = newDate.month(this.#maxDateObject.month());
      }
      // Keep original month otherwise
      else {
         newDate = newDate.month(currentMonth);
      }

      // Final clamp to maxDate if result is after
      if (this.#maxDateObject && newDate.startOf('month').isAfter(this.#maxDateObject)) {
         newDate = this.#maxDateObject.clone().startOf('month');
      }

      this.#timeNowLocal = newDate;
      this.updateCalendar();
   }

   #selectDay() {
      // Called internally after a valid day click or selectToday
      this.#timeSelected = this.#timeNowLocal.clone();
      this.#settings.startDate = this.#timeSelected.format(this.#settings.format);

      // Trigger user callback
      if (typeof this.#settings.onClick === 'function') {
         const callbackValue = this.#settings.format === 'dayjs'
            ? this.#timeSelected.clone() // Pass a clone to prevent modification
            : this.#timeSelected.format(this.#settings.format);
         this.#settings.onClick.call(this, callbackValue);
      }

      // Re-render to update visual state
      // Note: This might cause a double render if called from #onDayClick, which also calls updateCalendar.
      // Consider optimizing if performance is an issue.
      this.updateCalendar();
   }

   #onDayClick(e) {
      e.preventDefault();
      const target = e.currentTarget;
      if (target.classList.contains(CSS.DISABLED)) return;

      const toDay = parseInt(target.textContent);
      if (isNaN(toDay)) return;

      const clickedDate = this.#timeNowLocal.date(toDay);

      // Double-check against maxDate
      if (this.#isMaxDay(clickedDate)) {
         console.log("Clicked day is disabled (after maxDate):", clickedDate.format());
         return;
      }

      this.#timeNowLocal = clickedDate;
      this.#selectDay(); // Select date, trigger callback/update
   }

   selectToday() {
      const today = dayjs();
      if (this.#isMaxDay(today)) {
         console.warn('Cannot select today, it exceeds maxDate.');
         return;
      }

      this.#timeNowLocal = today;
      this.#selectDay();
   }

   #isMaxDay(dayjsDate) {
      if (!this.#maxDateObject) return false;
      // Check if day is strictly after maxDate
      return dayjsDate.startOf('day').isAfter(this.#maxDateObject);
   }

   #isSelectedDay(dayjsDate) {
      return this.#timeSelected !== null && dayjsDate.isSame(this.#timeSelected, 'day');
   }

   #onReadyFnCallback() {
      if (typeof this.#settings.onReady === 'function') {
         this.#settings.onReady.call(this, this.#timeNowLocal.clone()); // Pass a clone of the current date
      }
   }
}

export default IonCalendar;

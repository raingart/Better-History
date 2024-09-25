/**
 * Ion.Calendar v3.1
 * GitHub page: https://github.com/raingart/ion.calendar
*/

// import moment from 'moment';

class IonCalendar {
   #element;
   #settings;
   #timeNow;
   #timeNowLocal;
   #timeSelected;
   #firstStart = true;

   constructor(element, options = {}) {
      this.#element = element;
      this.#settings = { ...this.defaultSettings, ...options };
      this.#timeNow = moment();
      this.#timeNowLocal = this.#setTimeNowLocal();

      this.init()
   }

   get defaultSettings() {
      return {
         lang: 'en',
         sundayFirst: false,
         startDate: '',
         yearRange: '4',
         maxDate: '',
         format: '',
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

      this.#prepareData();
      this.#renderCalendar();
      this.#attachEvents();
      this.#onReadyFnCallback();
   }

   updateData(options) {
      this.#settings = { ...this.#settings, ...options };
      this.updateCalendar();
   }

   updateCalendar() {
      this.#element.innerHTML = '';
      this.#prepareData();
      this.#renderCalendar();
      this.#attachEvents();
   }

   #setTimeNowLocal() {
      return moment(this.#timeNow).locale(this.#settings.lang);
   }

   #prepareData() {
      this.#timeSelected = this.#parseStartDate(this.#settings.startDate);
      [this.fromYear, this.toYear] = this.#parseYears(this.#settings.yearRange);
      this.#setMaxDate();
   }

   #parseStartDate(startDate) {
      const format = this.#settings.format.includes('L') ? 'YYYY.MM.DD' : this.#settings.format;
      return moment(startDate, format).locale(this.#settings.lang);
   }

   #parseYears(years) {
      const tempYears = years.split('-');
      const fromYear = tempYears.length === 1 ? moment().subtract(tempYears[0], 'years').year() : parseInt(tempYears[0]);
      const toYear = tempYears.length === 2 ? parseInt(tempYears[1]) : parseInt(moment().year());
      return [fromYear, toYear];
   }

   #setMaxDate() {
      if (!this.#settings.maxDate) return;
      const maxDateInfo = this.#parseMaxDate(this.#settings.maxDate);
      if (maxDateInfo) {
         this.maxYear = maxDateInfo.year;
         this.maxMonth = maxDateInfo.month;
         this.maxDay = maxDateInfo.day;
      }
   }

   #renderCalendar() {
      const timeForWork = moment(this.#timeNowLocal);
      this.#element.innerHTML = `
         <div class="ic__container">
            <div class="ic__header">
               <div class="ic__prev"><div></div></div>
               <div class="ic__next"><div></div></div>
               <div class="ic__month">${this.#getMonthOptions(timeForWork)}</div>
               <div class="ic__year">${this.#getYearOptions()}</div>
            </div>
            ${this.#getWeekHeader(timeForWork)}
            ${this.#getDays()}
         </div>`;
   }

   #getMonthOptions(timeForWork) {
      let options = '';
      for (let i = 0; i < 12; i++) {
         options += `<option value="${i}" ${i === this.#timeNowLocal.month() ? 'selected' : ''}>${timeForWork.month(i).format('MMMM')}</option>`;
         if (this.#isMaxMonth(i)) break;
      }
      return `<select class="ic__month-select">${options}</select>`;
   }

   #getYearOptions() {
      let options = '';
      for (let i = this.fromYear; i <= this.toYear; i++) {
         options += `<option value="${i}" ${i === this.#timeNowLocal.year() ? 'selected' : ''}>${i}</option>`;
      }
      return `<select class="ic__year-select">${options}</select>`;
   }

   #getWeekHeader(timeForWork) {
      const START_DAY_INDEX = this.#settings.sundayFirst ? 0 : 1;
      let html = ``;
      for (let i = START_DAY_INDEX; i < this.#settings.daysInWeek + START_DAY_INDEX; i++) {
         const day = timeForWork.day(i % this.#settings.daysInWeek).format('dd');
         html += `<td>${day}</td>`;
      }
      return `<table class="ic__week-head"><tr>${html}</tr></table>`;
   }

   #getDays() {
      const weekFirstDay = parseInt(this.#timeNowLocal.startOf('month').format('d'));
      const monthLastDay = this.#timeNowLocal.daysInMonth();
      let weekLastDay = monthLastDay;

      const adjustedWeekFirstDay = this.#settings.sundayFirst ? weekFirstDay : Math.max(weekFirstDay - 1, 0);

      const emptyCellsBefore = Array.from({ length: adjustedWeekFirstDay }, () => `<td class="ic__day-empty">${this.#settings.emptyCell}</td>`).join('');

      let daysOfMonth = '';
      for (let i = 1; i <= monthLastDay; i++) {
         const isMaxDay = this.#isMaxDay(i);
         const isCurrentDay = moment(this.#timeNowLocal).date(i).isSame(this.#timeNow, 'day');
         const isSelectedDay = this.#isSelectedDay(i);

         if (isMaxDay) {
            daysOfMonth += `<td class="ic__day-empty">${this.#settings.emptyCell}</td>`;
         }
         else {
            const dayClass = `ic__day${isCurrentDay ? ' ic__day_state_current' : isSelectedDay ? ' ic__day_state_selected' : ''}`;
            daysOfMonth += `<td class="${dayClass}">${i}</td>`;
         }

         if ((adjustedWeekFirstDay + i) % this.#settings.daysInWeek === 0) daysOfMonth += `</tr><tr>`;

         // Stop adding days once the max day is reached
         if (isMaxDay) {
            weekLastDay = i;
            break;
         }
      }

      const emptyCellsNeeded = (adjustedWeekFirstDay + weekLastDay) % this.#settings.daysInWeek;
      const emptyCellsAfter = emptyCellsNeeded > 0
         ? Array.from({ length: this.#settings.daysInWeek - emptyCellsNeeded }, () => `<td class="ic__day-empty">${this.#settings.emptyCell}</td>`).join('')
         : '';

      return `<table class='ic__days'><tr>${emptyCellsBefore}${daysOfMonth}${emptyCellsAfter}</tr></table>`;
   }

   #attachEvents() {
      const $prev = this.#element.querySelector('.ic__prev');
      const $next = this.#element.querySelector('.ic__next');
      const $month = this.#element.querySelector('.ic__month-select');
      const $year = this.#element.querySelector('.ic__year-select');
      const $days = this.#element.querySelectorAll('.ic__day');

      if (this.#settings.hideArrows) {
         $prev.style.display = 'none';
         $next.style.display = 'none';
      }
      else {
         $prev.addEventListener('click', this.#onPrevClick.bind(this));
         $next.addEventListener('click', this.#onNextClick.bind(this));
      }

      $month.addEventListener('change', this.#onMonthChange.bind(this));
      $year.addEventListener('change', this.#onYearChange.bind(this));

      if (this.#settings.clickable) {
         $days.forEach(day => {
            day.addEventListener('click', this.#onDayClick.bind(this));
         });
      }
   }

   #onPrevClick(e) {
      e.preventDefault();
      this.#timeNowLocal.subtract(1, 'months');
      this.updateCalendar();
   }

   #onNextClick(e) {
      e.preventDefault();
      if (!this.#isMaxMonth(this.#timeNowLocal.month())) {
         this.#timeNowLocal.add(1, 'months');
         this.updateCalendar();
      }
   }

   #onMonthChange(e) {
      e.preventDefault();
      const toMonth = parseInt(e.target.value);
      this.#timeNowLocal.month(toMonth);
      this.updateCalendar();
   }

   #onYearChange(e) {
      e.preventDefault();
      const toYear = parseInt(e.target.value);
      this.#timeNowLocal.year(toYear);
      this.updateCalendar();
   }

   #selectDay() {
      this.#timeSelected = moment(this.#timeNowLocal);
      this.#settings.startDate = this.#timeSelected.format(this.#settings.format.includes('L') ? 'YYYY-MM-DD' : this.#settings.format);

      if (typeof this.#settings.onClick === 'function') {
         this.#settings.onClick.call(this, this.#settings.format === 'moment' ? this.#timeSelected : this.#timeSelected.format(this.#settings.format));
      }
      this.updateCalendar();
   }

   #onDayClick(e) {
      e.preventDefault();
      const toDay = parseInt(e.target.textContent);
      if (this.#isMaxDay(toDay)) return;

      this.#timeNowLocal.date(toDay);
      this.#selectDay();
   }

   selectToday() {
      this.#timeNowLocal = moment();
      this.#selectDay();
   }

   #isMaxYear(year) {
      return this.maxYear && this.maxYear === year;
   }

   #isMaxMonth(month) {
      return this.#isMaxYear(this.#timeNowLocal.year()) && this.maxMonth === month;
   }

   #isMaxDay(day) {
      return this.#isMaxYear(this.#timeNowLocal.year()) && this.#isMaxMonth(this.#timeNowLocal.month()) && day > this.maxDay;
   }

   #isSelectedDay(day) {
      return this.#timeSelected && moment(this.#timeNowLocal).date(day).isSame(this.#timeSelected, 'day');
   }

   #onReadyFnCallback() {
      if (typeof this.#settings.onReady === 'function') {
         this.#settings.onReady.call(this, this.#timeNowLocal.format());
      }

      if (this.#settings.startDate && this.#firstStart) {
         this.#firstStart = false;
         this.#timeNowLocal.year(parseInt(this.#timeSelected?.format('YYYY')));
         this.#timeNowLocal.month(parseInt(this.#timeSelected?.format('M')) - 1);
         this.updateCalendar();
      }
   }

   #parseMaxDate(maxDate) {
      const maxDateMoment = moment(maxDate, ['L', 'YYYY-MM-DD', 'YYYY.MM.DD', 'DD.MM.YYYY'], true);
      if (!maxDateMoment.isValid()) {
         console.error('Invalid maximum date format:', maxDate);
         return;
      }
      return {
         year: maxDateMoment.year(),
         month: maxDateMoment.month(),
         day: maxDateMoment.date(),
      };
   }
}

export default IonCalendar;

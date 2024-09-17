/**
 * Ion.Calendar v3
 * GitHub page: https://github.com/raingart/ion.calendar
*/

class IonCalendar {
   constructor(element, options = {}) {
      this.element = element;
      this.settings = {
         ...this.defaultSettings,
         ...options
      };

      this.timeNow = moment();
      this.timeNowLocal = moment(this.timeNow).locale(this.settings.lang);
      this.timeSelected = null;
      this.firstStart = true;

      this.init();
   }

   get defaultSettings() {
      return {
         lang: 'en',
         sundayFirst: false,
         years: '80',
         format: '',
         daysInWeek: 7,
         emptyCell: '&nbsp;',
         clickable: true,
         startDate: '',
         maxDate: '',
         hideArrows: false,
         onClick: null,
         onReady: null
      };
   }

   init() {
      if (this.element.dataset.isActive) return;
      this.element.dataset.isActive = true;

      this.prepareData();
      this.renderCalendar();
      this.attachEvents();
      this.onReadyFnCallback();
   }

   updateData(options) {
      this.settings = { ...this.settings, ...options };
      this.updateCalendar();
   }

   updateCalendar() {
      this.element.innerHTML = '';
      this.prepareData();
      this.renderCalendar();
      this.attachEvents();
   }

   prepareData() {
      this.timeSelected = this.settings.startDate ? this.parseStartDate(this.settings.startDate) : null;
      const [fromYear, toYear] = this.parseYears(this.settings.years);
      this.fromYear = fromYear;
      this.toYear = toYear;

      const maxDateInfo = this.parseMaxDate(this.settings.maxDate);
      if (maxDateInfo) {
         this.maxYear = maxDateInfo.year;
         this.maxMonth = maxDateInfo.month;
         this.maxDay = maxDateInfo.day;
      }

      this.setValidYearRange();
   }

   parseStartDate(startDate) {
      const format = this.settings.format.includes('L') ? 'YYYY.MM.DD' : this.settings.format;
      return moment(startDate, format).locale(this.settings.lang);
   }

   parseYears(years) {
      const tempYears = years.split('-');
      const fromYear = tempYears.length === 1 ? moment().subtract(tempYears[0], 'years').year() : parseInt(tempYears[0]);
      const toYear = tempYears.length === 2 ? parseInt(tempYears[1]) : parseInt(moment().year());
      return [fromYear, toYear];
   }

   setValidYearRange() {
      if (this.toYear < this.timeNowLocal.year()) {
         this.timeNowLocal.year(this.toYear).month(11); // December
      }
      else if (this.fromYear > this.timeNowLocal.year()) {
         this.timeNowLocal.year(this.fromYear).month(0); // January
      }
   }

   renderCalendar() {
      const timeForWork = moment(this.timeNowLocal);
      this.element.innerHTML = `
         <div class="ic__container">
            <div class="ic__header">
               <div class="ic__prev"><div></div></div>
               <div class="ic__next"><div></div></div>
               <div class="ic__month">${this.getMonthOptions(timeForWork)}</div>
               <div class="ic__year">${this.getYearOptions()}</div>
            </div>
            ${this.getWeekHeader(timeForWork)}
            ${this.getDays()}
         </div>`;
   }

   getMonthOptions(timeForWork) {
      let html = '<select class="ic__month-select">';
      for (let i = 0; i < 12; i++) {
         if (this.isMaxMonth(i)) break;
         html += `<option value="${i}" ${i === this.timeNowLocal.month() ? 'selected' : ''}>${timeForWork.month(i).format('MMMM')}</option>`;
      }
      html += `</select>`;
      return html;
   }

   getYearOptions() {
      let html = '<select class="ic__year-select">';
      for (let i = this.fromYear; i <= this.toYear; i++) {
         html += `<option value="${i}" ${this.timeNowLocal.year() === i ? 'selected' : ''}>${i}</option>`;
      }
      html += `</select>`;
      return html;
   }

   getWeekHeader(timeForWork) {
      const START_DAY_INDEX = this.settings.sundayFirst ? 0 : 1;
      let html = `<table class="ic__week-head"><tr>`;
      for (let i = START_DAY_INDEX; i < this.settings.daysInWeek + START_DAY_INDEX; i++) {
         const day = timeForWork.day(i % this.settings.daysInWeek).format('dd');
         html += `<td>${day}</td>`;
      }
      html += `</tr></table>`;
      return html;
   }

   getDays() {
      const weekFirstDay = parseInt(this.timeNowLocal.startOf('month').format('d'));
      const monthLastDay = this.timeNowLocal.daysInMonth();
      // let weekLastDay = parseInt(this.timeNowLocal.endOf('month').format('d'));
      let weekLastDay = monthLastDay;

      let html = `<table class='ic__days'><tr>`;

      const adjustedWeekFirstDay = this.settings.sundayFirst ? weekFirstDay : Math.max(weekFirstDay - 1, 0);

      // Add empty cells for the days before the first day of the month
      for (let i = 0; i < adjustedWeekFirstDay; i++) {
         html += `<td class="ic__day-empty">${this.settings.emptyCell}</td>`;
      }

      // Add days of the month
      for (let i = 1; i <= monthLastDay; i++) {
         const isMaxDay = this.isMaxDay(i);
         const isCurrentDay = moment(this.timeNowLocal).date(i).isSame(this.timeNow, 'day');
         const isSelectedDay = this.isSelectedDay(i);

         if (isMaxDay) {
            html += `<td class="ic__day-empty">${this.settings.emptyCell}</td>`;
         }
         else {
            const dayClass = `ic__day${isCurrentDay ? ' ic__day_state_current' : isSelectedDay ? ' ic__day_state_selected' : ''}`;
            html += `<td class="${dayClass}">${i}</td>`;
         }

         // Close the row and start a new one if the week ends
         if ((adjustedWeekFirstDay + i) % this.settings.daysInWeek === 0) {
            html += `</tr><tr>`;
         }

         // Stop adding days once the max day is reached
         if (isMaxDay) {
            weekLastDay = i
            break;
         }
      }

      // Add empty cells for the days after the last day of the month
      const adjustedWeekLastDay = (adjustedWeekFirstDay + weekLastDay) % this.settings.daysInWeek;
      if (adjustedWeekLastDay !== 0) { // Only add empty cells if the last day is not the last day of the week
         for (let i = adjustedWeekLastDay; i < this.settings.daysInWeek; i++) {
            html += `<td class="ic__day-empty">${this.settings.emptyCell}</td>`;
         }
      }

      html += `</tr></table>`;
      return html;
   }

   attachEvents() {
      const $prev = this.element.querySelector('.ic__prev');
      const $next = this.element.querySelector('.ic__next');
      const $month = this.element.querySelector('.ic__month-select');
      const $year = this.element.querySelector('.ic__year-select');
      const $days = this.element.querySelectorAll('.ic__day');

      if (this.settings.hideArrows) {
         $prev.style.display = 'none';
         $next.style.display = 'none';
      }
      else {
         $prev.addEventListener('click', (e) => {
            e.preventDefault();
            this.timeNowLocal.subtract(1, 'months');
            this.updateCalendar();
         });
         $next.addEventListener('click', (e) => {
            e.preventDefault();
            this.timeNowLocal.add(1, 'months');
            if (this.isMaxMonth(this.timeNowLocal.month())) {
               this.timeNowLocal.subtract(1, 'months');
            }
            this.updateCalendar();
         });
      }

      $month.addEventListener('change', (e) => {
         e.preventDefault();
         const toMonth = parseInt(e.target.value);
         this.timeNowLocal.month(toMonth);
         this.updateCalendar();
      });
      $year.addEventListener('change', (e) => {
         e.preventDefault();
         const toYear = parseInt(e.target.value);
         this.timeNowLocal.year(toYear);
         this.updateCalendar();
      });

      if (this.settings.clickable) {
         $days.forEach(day => {
            day.addEventListener('click', (e) => {
               e.preventDefault();
               const toDay = parseInt(e.target.textContent);
               const isMaxDay = this.isMaxDay(toDay);

               if (isMaxDay) return;

               this.timeNowLocal.date(toDay);
               this.timeSelected = moment(this.timeNowLocal);
               this.settings.startDate = this.timeSelected.format(this.settings.format.includes('L') ? 'YYYY-MM-DD' : this.settings.format);

               if (typeof this.settings.onClick === 'function') {
                  this.settings.onClick.call(this, this.settings.format === 'moment' ? this.timeSelected : this.timeSelected.format(this.settings.format));
               }

               this.updateCalendar();
            });
         });
      }
   }

   isMaxYear(year) {
      return this.maxYear && this.maxYear === year;
   }

   isMaxMonth(month) {
      return this.isMaxYear(this.timeNowLocal.year()) && this.maxMonth === month;
   }

   isMaxDay(day) {
      return this.isMaxYear(this.timeNowLocal.year()) && this.isMaxMonth(this.timeNowLocal.month()) && day > this.maxDay;
   }

   isSelectedDay(day) {
      return this.timeSelected && moment(this.timeNowLocal).date(day).isSame(this.timeSelected, 'day');
   }

   onReadyFnCallback() {
      if (typeof this.settings.onReady === 'function') {
         this.settings.onReady.call(this, this.timeNowLocal.format());
      }

      if (this.settings.startDate && this.firstStart) {
         this.firstStart = false;
         this.timeNowLocal.year(parseInt(this.timeSelected.format('YYYY')));
         this.timeNowLocal.month(parseInt(this.timeSelected.format('M')) - 1);
         this.updateCalendar();
      }
   }

   selectToday() {
      this.timeNowLocal = moment().locale(this.settings.lang);
      this.updateCalendar();
   }

   parseMaxDate(maxDate) {
      let maxDateMoment;
      try {
         maxDateMoment = moment(maxDate, ['L', 'YYYY-MM-DD', 'YYYY.MM.DD', 'DD.MM.YYYY'], true);
         if (!maxDateMoment.isValid()) {
            throw new Error('Invalid maximum date format: ' + maxDate);
         }
      } catch (e) {
         console.error(e.message);
         return { year: null, month: null, day: null };
      }
      return {
         year: maxDateMoment.year(),
         month: maxDateMoment.month(),
         day: maxDateMoment.date()
      };
   }
}

export default IonCalendar;

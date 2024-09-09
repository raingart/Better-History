/**
 * Ion.Calendar v2.1.0
 * Authors: Denis Ineshin, raingart 2024
 * GitHub page:     https://github.com/raingart/ion.calendar
*/

(function (jQuery) {
   // Import Moment.js library
   try {
      var timeNow = moment();
   } catch (e) {
      alert("Can't find Moment.js. Please ensure it's included.");
      throw new Error("Moment.js not found");
   }

   const CONSTANTS = {
      DAYS_IN_WEEK: 7,
      EMPTY_CELL: '&nbsp;',
   };

   const methods = {
      init: function (options) {
         const defaultSettings = {
            lang: 'en',
            sundayFirst: false,
            years: '80',
            format: '',
            clickable: true,
            startDate: '',
            maxDate: '',
            hideArrows: false,
            onClick: null,
            onReady: null
         };

         const settings = { ...defaultSettings, ...options };

         return this.each(function () {
            const $calendar = jQuery(this);

            // Prevent overwrite
            if ($calendar.data('isActive')) {
               return;
            }
            $calendar.data('isActive', true);

            let
               $prev,
               $next,
               $month,
               $year,
               $day,
               timeSelected,
               timeNowLocal = moment(timeNow.locale(settings.lang)),
               timeForWork = moment(timeNowLocal),
               weekFirstDay,
               weekLastDay,
               monthLastDay,
               fromYear,
               toYear,
               firstStart = true,
               maxYear,
               maxMonth,
               maxDay;

            // Public methods
            this.updateData = function (options) {
               settings = Object.assign(settings, options);
               removeHTML();
            };

            // Private methods
            const removeHTML = () => {
               detachEvents();
               prepareData();
               prepareCalendar();
               attachEvents();
            };

            const detachEvents = () => {
               $prev.off('click');
               $next.off('click');
               $month.off('change');
               $year.off('change');
               $day.off('click');
            };

            const attachEvents = () => {
               if (!settings.hideArrows) {
                  $prev.on('click', e => {
                     e.preventDefault();
                     timeNowLocal.subtract(1, 'months');
                     if (timeNowLocal.year() < fromYear) {
                        timeNowLocal.add(1, 'months');
                     }
                     removeHTML();
                  });
                  $next.on('click', e => {
                     e.preventDefault();
                     timeNowLocal.add(1, 'months');
                     if (timeNowLocal.year() > toYear) {
                        timeNowLocal.subtract(1, 'months');
                     }
                     removeHTML();
                  });
               }

               $month.on('change', e => {
                  e.preventDefault();
                  const toMonth = $month.val();
                  timeNowLocal.month(toMonth);
                  removeHTML();
               });

               $year.on('change', e => {
                  e.preventDefault();
                  const toYear = $year.val();
                  timeNowLocal.year(toYear);
                  removeHTML();
               });

               if (settings.clickable) {
                  $day.on('click', function (e) {
                     e.preventDefault();
                     const toDay = $(this).text();

                     const isMaxYear = maxYear && (maxYear === timeNowLocal.year());
                     const isMaxMonth = isMaxYear && (maxMonth === timeNowLocal.month());
                     const isMaxDay = isMaxYear && isMaxMonth && toDay > maxDay;

                     if (isMaxDay) return;

                     timeNowLocal.date(parseInt(toDay));
                     timeSelected = moment(timeNowLocal);
                     settings.startDate = timeSelected.format(settings.format.includes('L') ? 'YYYY-MM-DD' : settings.format);

                     // trigger callback function
                     if (typeof settings.onClick === 'function') {
                        settings.onClick.call(this, settings.format === 'moment' ? timeSelected : timeSelected.format(settings.format));
                     }

                     removeHTML();
                  });
               }
            };

            const prepareData = () => {
               // Start date
               if (settings.startDate) {
                  timeSelected = moment(settings.startDate, settings.format.includes('L') ? 'YYYY.MM.DD' : settings.format);
               }

               // Years diapason
               const tempYears = settings.years.toString().split('-');
               try {
                  fromYear = tempYears.length === 1 ? moment().subtract(tempYears[0], 'years').year() : parseInt(tempYears[0]);
                  toYear = tempYears.length === 2 ? parseInt(tempYears[1]) : parseInt(moment().year());
               } catch (e) {
                  console.error('Invalid years format:', settings.years);
                  // Handle the error appropriately, e.g., by setting default values or informing the user
               }

               const maxDateInfo = settings.maxDate && parseMaxDate(settings.maxDate);
               if (maxDateInfo) {
                  maxYear = maxDateInfo.year;
                  maxMonth = maxDateInfo.month;
                  maxDay = maxDateInfo.day;
               }

               // Ensure toYear is within valid range
               if (toYear < timeNowLocal.year()) {
                  timeNowLocal = timeNowLocal.year(toYear).month(11); // December
               }
               else if (fromYear > timeNowLocal.year()) {
                  timeNowLocal = timeNowLocal.year(fromYear).month(0); // January
               }
            };

            const prepareCalendar = () => {
               const isMaxYear = maxYear && (maxYear === timeNowLocal.year());
               const isMaxMonth = isMaxYear && (maxMonth === timeNowLocal.month());

               weekFirstDay = parseInt(timeForWork.startOf('month').format('d'));
               weekLastDay = parseInt(timeForWork.endOf('month').format('d')) + 1;
               monthLastDay = timeForWork.daysInMonth();

               let html = `<div class="ic__container">`;
               html += `<div class="ic__header">`;
               html += `<div class="ic__prev"><div></div></div>`;
               html += `<div class="ic__next"><div></div></div>`;

               // Head month
               html += `<div class="ic__month"><select class="ic__month-select">`;
               for (let i = 0; i < 12; i++) {
                  if (isMaxYear && (i > maxMonth)) continue;
                  html += `<option value="${i}" ${i === timeNowLocal.month() ? 'selected' : ''}>${timeForWork.month(i).format('MMMM')}</option>`;
               }
               html += `</select></div>`;

               // Head year
               html += `<div class="ic__year"><select class="ic__year-select">`;
               for (let i = fromYear; i <= toYear; i++) {
                  html += `<option value="${i}" ${timeNowLocal.year() === i ? 'selected' : ''} ${i === maxYear ? 'disabled' : ''}>${i}</option>`;
               }
               html += `</select></div>`;
               html += `</div>`;

               // Week header
               html += `<table class="ic__week-head"><tr>`;
               const START_DAY_INDEX = settings.sundayFirst ? 0 : 1;
               for (let i = START_DAY_INDEX; i < CONSTANTS.DAYS_IN_WEEK + START_DAY_INDEX; i++) {
                  html += `<td>${timeForWork.day(i % CONSTANTS.DAYS_IN_WEEK).format('dd')}</td>`;
               }
               html += `</tr></table>`;

               // Days
               html += `<table class="ic__days"><tr>`;

               // Render days and empty cells
               for (let i = 0; i < weekFirstDay; i++) {
                  html += `<td class="ic__day-empty">${CONSTANTS.EMPTY_CELL}</td>`;
               }

               for (let i = 1; i <= monthLastDay; i++) {
                  const isMaxDay = isMaxYear && isMaxMonth && i > maxDay;
                  const isCurrentDay = moment(timeNowLocal).date(i).isSame(timeNow, 'day');
                  const isSelectedDay = timeSelected && moment(timeNowLocal).date(i).isSame(timeSelected, 'day');

                  if (isMaxDay) {
                     html += `<td class="ic__day-empty">${CONSTANTS.EMPTY_CELL}</td>`;
                  }
                  else {
                     const dayClass = `ic__day${isCurrentDay ? ' ic__day_state_current' : isSelectedDay ? ' ic__day_state_selected' : ''}`;
                     html += `<td class="${dayClass}">${i}</td>`;
                  }

                  if ((weekFirstDay + i) % CONSTANTS.DAYS_IN_WEEK === 0) {
                     html += `</tr><tr>`;
                  }

                  // stop rendering other days
                  if (isMaxDay) {
                     weekLastDay = (weekFirstDay + i) % CONSTANTS.DAYS_IN_WEEK;
                     break;
                  }
               }

               for (let i = weekLastDay; i < CONSTANTS.DAYS_IN_WEEK; i++) {
                  html += `<td class="ic__day-empty">${CONSTANTS.EMPTY_CELL}</td>`;
               }

               html += `</tr></table>`;
               html += `</div>`;

               $calendar.html(html);

               // Cache DOM elements
               $prev = $calendar.find('.ic__prev');
               $next = $calendar.find('.ic__next');
               $month = $calendar.find('.ic__month-select');
               $year = $calendar.find('.ic__year-select');
               $day = $calendar.find('.ic__day');

               attachEvents();

               if (typeof settings.onReady === 'function') {
                  settings.onReady.call(this, timeNowLocal.format());
               }

               if (settings.startDate && firstStart) {
                  firstStart = false;
                  timeNowLocal.year(parseInt(timeSelected.format('YYYY')));
                  timeNowLocal.month(parseInt(timeSelected.format('M') - 1));
                  removeHTML();
               }
            };

            prepareData();
            prepareCalendar();

            function parseMaxDate(maxDate) {
               let maxDateMoment;
               try {
                  // Attempt to parse maxDate using Moment.js with a liberal format
                  maxDateMoment = moment(maxDate, ['L', 'YYYY-MM-DD', 'YYYY.MM.DD', 'DD.MM.YYYY'], true);
                  if (!maxDateMoment.isValid()) {
                     throw new Error('Invalid maximum date format:' + maxDate);
                  }
               } catch (e) {
                  console.error(e.message);
                  return { year: null, month: null, day: null }; // Return default values if parsing fails
               }

               return {
                  year: maxDateMoment.year(),
                  month: maxDateMoment.month(),
                  day: maxDateMoment.date()
               };
            }
         });
      },
      update: function (options) {
         return this.each(function () {
            this.updateData(options);
         });
      }
   };

   jQuery.fn.ionCalendar = function (method) {
      if (methods[method]) {
         return methods[method].apply(this, arguments.slice(1));
      }
      else if (typeof method === 'object' || !method) {
         return methods.init.apply(this, arguments);
      }
      else {
         jQuery.error(`Method ${method} does not exist for jQuery.ionCalendar`);
      }
   };
})(jQuery);

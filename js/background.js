importScripts('/js/libs/browser-support.js');

browser.commands.onCommand.addListener(doCommand);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
   doCommand(message.command);
});

function doCommand(command) {
   switch (command) {
      case 'open-history-page':
         // open new
         // browser.tabs.query({ active: true, currentWindow: true }, tabs => {
         //    if (tabs.length) {
         //       browser.tabs.create({
         //          index: tabs[0].index + 1, // Open to the right of the active tab
         //          url: "/html/history.html" // Set the URL of the new tab
         //       });
         //    }
         // });
         // update current tab
         // browser.tabs.query({ active: true, currentWindow: true }, tabs => {
         //    browser.tabs.update(tabs[0].id, { url: "/html/history.html" });
         // });

         // combined
         browser.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (tabs.length) {
               const link = `chrome-extension://${browser.runtime.id}/html/history.html`;

               browser.tabs.query({ url: link }, existingTabs => {
                  if (existingTabs && existingTabs.length) {
                     // set focus
                     browser.tabs.update(existingTabs[0].id, { active: true, highlighted: true });
                  }
                  else {
                     browser.tabs.create({
                        index: tabs[0].index + 1, // Open to the right of the active tab
                        url: link,
                     });
                  }
               });
            }
         });
         break;
   }
}

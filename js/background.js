chrome.commands.onCommand.addListener(command => {
   doCommand(command);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
   doCommand(request.command);
});

function doCommand(command) {
   switch (command) {
      case 'open-history-page':
         // open new
         // chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
         //    if (tabs.length) {
         //       chrome.tabs.create({
         //          index: tabs[0].index + 1, // Open to the right of the active tab
         //          url: "/html/history.html" // Set the URL of the new tab
         //       });
         //    }
         // });
         // update current tab
         // chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
         //    chrome.tabs.update(tabs[0].id, { url: "/html/history.html" });
         // });

         // combined
         chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
            if (tabs.length) {
               const link = `chrome-extension://${chrome.runtime.id}/html/history.html`;

               chrome.tabs.query({ url: link }, existingTabs => {
                  if (existingTabs && existingTabs.length) {
                     // set focus
                     chrome.tabs.update(existingTabs[0].id, { active: true, highlighted: true });
                  }
                  else {
                     chrome.tabs.create({
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

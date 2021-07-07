# Accommodate Service Manager and Notification Generator
Accommodate is a service manager and notification generator for client service tracking and notification. It is designed to be flexible, so you can change the follwowing terminology to be whatever you want:

* Students
* Services
* Notices

So instead of sending a *notice* about *services* provided to *students*, you could configure the app to send *letters* about *activities* engaged in by *clients*.

The app was made to teach myself Svelte's frontend framework and Electron; therefore it can be built to run on Windows, Linux, or Mac computers (though only Windows is accounted for in the build script) and it cannot run in the browser in its current state. Note that this is an experiment (although one I made to solve a particular problem in my day job as a college disability support coordinator, and one that I use nearly every day!)--it is not a super-polished production application. It does not consider web accessibility standards or security best practices, and major improvements to the in-app notification editor are due.

But if you like it, feel free to fork it and make it work for you! Just run `npm run serve` to try it out!
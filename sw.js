const CACHE_NAME = 'halo-flashpoint-v51';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './icons/icon-home-help.svg',
  './icons/icon-home-combat.svg',
  './icons/icon-home-squads.svg',
  './icons/icon-home-battle.svg',
  './icons/icon-home-barracks.svg',
  './icons/icon-home-rules.svg',
  './icons/icon-battle.svg',
  './icons/icon-armory.svg',
  './icons/icon-rules.svg',
  './icons/icon-help.svg',
  './icons/icon-unsc.svg',
  './icons/icon-banished.svg',
  './icons/icon-p1.svg',
  './icons/icon-p2.svg',
  './icons/icon-recon.svg',
  './icons/icon-crit.svg',
  './icons/icon-shield.svg',
  './icons/icon-reroll.svg',
  './icons/icon-los.svg',
  './icons/icon-winner.svg',
  './icons/icon-dice.svg',
  './icons/icon-cmd-model.svg',
  './icons/icon-cmd-dice.svg',
  './icons/icon-cmd-advance.svg',
  './icons/icon-cmd-shoot.svg',
  './icons/icon-cmd-assault.svg',
  './icons/icon-cmd-special.svg',
  './manifest.json',
  './data.js',
  './fonts.css',
  './vendor/exceljs.min.js',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './fonts/Rajdhani-500-latin-ext.woff2',
  './fonts/Rajdhani-500-latin.woff2',
  './fonts/Rajdhani-600-latin-ext.woff2',
  './fonts/Rajdhani-600-latin.woff2',
  './fonts/Rajdhani-700-latin-ext.woff2',
  './fonts/Rajdhani-700-latin.woff2',
  './fonts/ShareTechMono-400-latin.woff2',
  './img/units/atriox-jiralhanae-warmaster.jpg',
  './img/units/captain-veronica-dare.jpg',
  './img/units/gunnery-sergeant-edward-buck.jpg',
  './img/units/jiralhanae-berserker-dynamo-grenade.jpg',
  './img/units/jiralhanae-berserker-spike-grenade.jpg',
  './img/units/jiralhanae-captain-mlrs-2-hydra.jpg',
  './img/units/jiralhanae-captain-ravager.jpg',
  './img/units/jiralhanae-chosen-warrior.jpg',
  './img/units/jiralhanae-sniper-shock-rifle.jpg',
  './img/units/jiralhanae-sniper-skewer.jpg',
  './img/units/jiralhanae-warrior.jpg',
  './img/units/master-chief.jpg',
  './img/units/odst-2nd-lieutenant.jpg',
  './img/units/odst-air-assault-bullfrog-m7s-smg.jpg',
  './img/units/odst-air-assault-bullfrog-ma40-assault-rifle.jpg',
  './img/units/odst-captain.jpg',
  './img/units/odst-firebreak-m7059-flamethrower.jpg',
  './img/units/odst-firebreak-m90-shotgun.jpg',
  './img/units/odst-special-purpose-trooper-br55-battle-rifle.jpg',
  './img/units/odst-special-purpose-trooper-m392-dmr.jpg',
  './img/units/shangheili-mercenary-energy-sword.jpg',
  './img/units/shangheili-mercenary-needler.jpg',
  './img/units/shangheili-mercenary-plasma-rifle.jpg',
  './img/units/shangheili-mercenary-pulse-carbine.jpg',
  './img/units/spartan-brawler-cqs48-bulldog.jpg',
  './img/units/spartan-brawler-needler.jpg',
  './img/units/spartan-cqb-energy-sword.jpg',
  './img/units/spartan-cqb-gravity-hammer.jpg',
  './img/units/spartan-deadeye-m392-dmr.jpg',
  './img/units/spartan-deadeye-stalker-rifle.jpg',
  './img/units/spartan-gungnir-m319-grenade-launcher.jpg',
  './img/units/spartan-gungnir-plasma-launcher.jpg',
  './img/units/spartan-hazop-m45-shotgun.jpg',
  './img/units/spartan-hazop-sp-ke-rifle.jpg',
  './img/units/spartan-jfo-concussion-rifle.jpg',
  './img/units/spartan-jfo-h-165-target-locator.jpg',
  './img/units/spartan-mk-vii-ma40-assault-rifle.jpg',
  './img/units/spartan-mk-vii-pulse-carbine.jpg',
  './img/units/spartan-zvezda-cindershot.jpg',
  './img/units/spartan-zvezda-vk78-commando.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});

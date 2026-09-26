# APKMASON Automatic — interaktywna prezentacja w 3D

**Zobacz na żywo: [apkmasondev.github.io/time-v2](https://apkmasondev.github.io/time-v2/)**

Strona demonstracyjna pokazująca, jak może wyglądać premium prezentacja produktu w przeglądarce: filmowe intro płynnie przechodzi w model zegarka renderowany na żywo, a kolejne rozdziały opowiada scroll. APKMASON to marka pokazowa. Strona nie jest ofertą handlową.

## Co jest w środku

- **Model 3D w czasie rzeczywistym** (three.js). Stal szczotkowana i polerowana, tarcza sunburst, szkło szafirowe i grawerowany dekiel. Wskazówki i data pokazują aktualny czas.
- **Rozdziały sterowane scrollem:** koperta, makro bransolety, tarcza, widok rozstrzelony z opisem ośmiu elementów.
- **„Na nadgarstku”:** dwa filmy, dzień i noc, łączone w dyptyk.
- **Konfigurator:** pięć tarcz, trzy oświetlenia studyjne, podgląd dekla, obrót przeciąganiem.
- **Finał w kolorze wybranej tarczy:** film przenika się do wybranego wariantu w tym samym momencie ujęcia.
- **Specyfikacja** z rysunkiem technicznym i formularz zapytania (otwiera program pocztowy).
- **Wersje PL / EN**, pełna obsługa telefonów, opcjonalny dźwięk, respektowanie ustawienia „ogranicz ruch”.

## Uruchomienie lokalne

Wymagany Node.js 20.19+ lub 22.12+.

```bash
npm install
npm run dev       # http://127.0.0.1:5173  (?skip pomija ekran startowy i film)
npm run build     # statyczna strona w dist/
npm run preview
```

Każdy push na gałąź `main` buduje stronę i publikuje ją na GitHub Pages (`.github/workflows/deploy.yml`).

## Struktura

| Ścieżka | Zawartość |
|---|---|
| `index.html` | Treść i struktura strony. |
| `src/main.js` | Loader, intro, choreografia scrolla, konfigurator, filmy, menu, formularz. |
| `src/scene.js` | Scena 3D: materiały, postument z odbiciem, widok rozstrzelony, wskazówki. |
| `src/textures.js` | Proceduralne tekstury: nadruk tarczy, sunburst, szczotkowana stal, grawer. |
| `src/env.js` | Wirtualne studio fotograficzne: Studio, Noc, Złota godzina. |
| `src/i18n.js` | Teksty PL / EN i specyfikacja. |
| `src/config.js` | Adres e-mail dla zapytań (domyślnie pusty). |
| `public/models/` | Model zegarka (glTF, kompresja meshopt). |
| `public/video/`, `public/img/` | Filmy w wersjach 1080p i 720p oraz ich plakaty. |
| `public/seq/` | Klatki makro bransolety przewijane scrollem. |

## Technologie

[three.js](https://threejs.org) · [GSAP ScrollTrigger](https://gsap.com) · [Lenis](https://lenis.darkroom.engineering) · [Vite](https://vite.dev)

Model zegarka zbudowano proceduralnie w Blenderze. Filmy wygenerowano z pomocą AI, a potem przycięto i dopasowano kolorystycznie.

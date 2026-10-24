# Fleuri storefront

This folder contains only the storefront and the assets it uses. GitHub Pages
publishes it as a static website; the workflow in `.github/workflows/pages.yml`
deploys the site whenever changes are pushed to the `main` branch.

To publish, create a public GitHub repository named `fleuri`, upload the
contents of this folder (including the `.github` and `assets` folders), and
ensure the default branch is `main`. In the repository settings, open
**Pages** and set the build and deployment source to **GitHub Actions**. After
the workflow finishes, GitHub shows the public site URL in the Pages settings.

The account, cart, and order features are a browser-only demo using local
storage. This static deployment does not provide shared customer accounts,
server-side order storage, or real payment processing. Do not enter real
passwords or sensitive customer data.

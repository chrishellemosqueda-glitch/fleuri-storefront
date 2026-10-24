(() => {
  const ACCOUNT_KEY = 'fleuri.accounts.v1';
  const ORDER_KEY = 'fleuri.orders.v1';
  const SESSION_KEY = 'fleuri.session.v1';
  const ADMIN_EMAIL = 'admin@fleuri.local';
  const ADMIN_PASSWORD = 'admin123';
  const ORDER_STATUSES = ['Awaiting payment', 'Paid', 'Completed', 'Cancelled'];

  const dialog = document.getElementById('accountDialog');
  const dialogTitle = document.getElementById('accountDialogTitle');
  const dialogMessage = document.getElementById('accountDialogMessage');
  const dialogContent = document.getElementById('accountDialogContent');
  const dialogClose = dialog.querySelector('.account-dialog-close');
  const dialogDone = dialog.querySelector('.account-dialog-done');
  const accountActions = document.querySelector('.account-links');
  const cartBadge = document.querySelector('[data-cart-toggle] .badge, .mini-icon .badge');
  const cartDrawer = document.getElementById('cartDrawer');
  const qrPanel = document.getElementById('qrPanel');
  const fulfillmentForm = document.getElementById('fulfillmentForm');

  let signedInUser = null;
  let pendingCheckout = false;
  let initializationError = null;

  function readRecords(key, label) {
    const value = localStorage.getItem(key);
    if (value === null) return [];

    let records;
    try {
      records = JSON.parse(value);
    } catch (error) {
      throw new Error(`Saved ${label} data is unreadable. Clear this browser's Fleuri demo data to continue.`, { cause: error });
    }
    if (!Array.isArray(records)) {
      throw new Error(`Saved ${label} data is invalid. Clear this browser's Fleuri demo data to continue.`);
    }
    return records;
  }

  function saveRecords(key, records) {
    localStorage.setItem(key, JSON.stringify(records));
  }

  function encodeHex(bytes) {
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPassword(password, salt) {
    if (!crypto.subtle) {
      throw new Error('Password hashing is unavailable in this browser. Open the storefront using a local web server.');
    }
    const bytes = new TextEncoder().encode(`${salt}:${password}`);
    return encodeHex(await crypto.subtle.digest('SHA-256', bytes));
  }

  function createSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return encodeHex(bytes);
  }

  async function seedAdminAccount() {
    const accounts = readRecords(ACCOUNT_KEY, 'account');
    if (accounts.some((account) => account.role === 'admin')) return true;

    const salt = 'fleuri-demo-cashier-salt';
    accounts.push({
      id: 'fleuri-demo-admin',
      name: 'Fleuri Cashier',
      email: ADMIN_EMAIL,
      role: 'admin',
      salt,
      passwordHash: await hashPassword(ADMIN_PASSWORD, salt),
      createdAt: new Date().toISOString()
    });
    saveRecords(ACCOUNT_KEY, accounts);
    return true;
  }

  const ready = seedAdminAccount().catch((error) => {
    initializationError = error;
    console.error('Fleuri account setup failed:', error);
    showToast(error.message);
    return false;
  });

  function showToast(message, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'fleuri-toast';
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      maxWidth: 'min(420px, calc(100vw - 40px))',
      background: isError ? '#a52e37' : '#2e3d74',
      color: '#fff',
      padding: '12px 16px',
      borderRadius: '10px',
      fontSize: '13px',
      lineHeight: '1.4',
      boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
      zIndex: '2000'
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function openDialog(title, message = '', content = '') {
    dialogTitle.textContent = title;
    dialogMessage.textContent = message;
    dialogMessage.classList.remove('account-error');
    dialogMessage.hidden = !message;
    dialogContent.replaceChildren();
    if (content) dialogContent.innerHTML = content;
    dialogDone.hidden = true;
    if (!dialog.open) dialog.showModal();
  }

  function showFormError(message) {
    dialogMessage.textContent = message;
    dialogMessage.classList.add('account-error');
    dialogMessage.hidden = false;
  }

  function loadAccounts() {
    return readRecords(ACCOUNT_KEY, 'account');
  }

  function loadOrders() {
    return readRecords(ORDER_KEY, 'order');
  }

  function saveSession(user) {
    localStorage.setItem(SESSION_KEY, user.email);
    signedInUser = user;
    updateAccountLinks();
  }

  function restoreSession() {
    const email = localStorage.getItem(SESSION_KEY);
    if (!email) return;
    signedInUser = loadAccounts().find((account) => account.email === email) || null;
    if (!signedInUser) localStorage.removeItem(SESSION_KEY);
  }

  function updateAccountLinks() {
    const buttons = accountActions.querySelectorAll('.account-action');
    const trackButton = accountActions.querySelector('[data-account-mode="track"]');
    const loginButton = accountActions.querySelector('[data-account-mode="login"]');
    const registerButton = accountActions.querySelector(
      '[data-account-mode="register"], [data-account-mode="logout"]'
    );

    if (!signedInUser) {
      trackButton.textContent = 'Track Order';
      loginButton.textContent = 'Login';
      registerButton.textContent = 'Registration';
      registerButton.dataset.accountMode = 'register';
      buttons.forEach((button) => {
        button.removeAttribute('title');
      });
      return;
    }

    trackButton.textContent = signedInUser.role === 'admin' ? 'Cashier Dashboard' : 'Track Order';
    loginButton.textContent = signedInUser.name;
    registerButton.textContent = 'Logout';
    registerButton.dataset.accountMode = 'logout';
    buttons.forEach((button) => {
      button.title = signedInUser.email;
    });
  }

  function showLoginForm() {
    openDialog(
      'Sign in',
      `Demo cashier account: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}. Demo data is stored only in this browser; do not use real passwords or customer information.`,
      `<form class="account-form" id="loginForm">
        <label>Email<input name="email" type="email" autocomplete="username" required /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Sign in</button>
        <button class="account-secondary-action" type="button" data-open-register>Create a customer account</button>
      </form>`
    );

    document.getElementById('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      try {
        if (!(await ready)) throw initializationError;
        const email = String(values.get('email')).trim().toLowerCase();
        const password = String(values.get('password'));
        const account = loadAccounts().find((user) => user.email === email);
        if (!account || (await hashPassword(password, account.salt)) !== account.passwordHash) {
          throw new Error('Email or password is incorrect.');
        }
        saveSession(account);
        dialog.close();
        showToast(`Welcome, ${account.name}.`);
        if (pendingCheckout) finishPendingCheckout();
      } catch (error) {
        showFormError(error.message || 'Sign-in failed. Please try again.');
      }
    });

    document.querySelector('[data-open-register]').addEventListener('click', showRegisterForm);
  }

  function showRegisterForm() {
    openDialog(
      'Create customer account',
      'Customer accounts are saved in this browser for this demo.',
      `<form class="account-form" id="registerForm">
        <label>Full name<input name="name" type="text" autocomplete="name" maxlength="80" required /></label>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required /></label>
        <label>Password<input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
        <label>Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required /></label>
        <button type="submit">Create account</button>
        <button class="account-secondary-action" type="button" data-open-login>Already have an account? Sign in</button>
      </form>`
    );

    document.getElementById('registerForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      const name = String(values.get('name')).trim();
      const email = String(values.get('email')).trim().toLowerCase();
      const password = String(values.get('password'));
      const confirmPassword = String(values.get('confirmPassword'));

      try {
        if (!(await ready)) throw initializationError;
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const accounts = loadAccounts();
        if (accounts.some((account) => account.email === email)) {
          throw new Error('An account with that email already exists.');
        }
        const salt = createSalt();
        const account = {
          id: `customer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          email,
          role: 'customer',
          salt,
          passwordHash: await hashPassword(password, salt),
          createdAt: new Date().toISOString()
        };
        accounts.push(account);
        saveRecords(ACCOUNT_KEY, accounts);
        saveSession(account);
        dialog.close();
        showToast(`Customer account created. Welcome, ${account.name}.`);
        if (pendingCheckout) finishPendingCheckout();
      } catch (error) {
        showFormError(error.message || 'Registration failed. Please try again.');
      }
    });

    document.querySelector('[data-open-login]').addEventListener('click', showLoginForm);
  }

  function showProfile() {
    const role = signedInUser.role === 'admin' ? 'Cashier' : 'Customer';
    openDialog(
      'Your account',
      `${signedInUser.name} · ${signedInUser.email} · ${role}`,
      `<button class="account-secondary-action" type="button" data-account-close>Close</button>`
    );
    document.querySelector('[data-account-close]').addEventListener('click', () => dialog.close());
  }

  function formatMoney(value) {
    return `₱${Number(value).toLocaleString('en-PH')}`;
  }

  function showCustomerOrders() {
    const orders = loadOrders()
      .filter((order) => order.customerEmail === signedInUser.email)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    openDialog('Your orders', 'Order status updates appear here when the cashier processes your order.');
    if (!orders.length) {
      dialogContent.textContent = 'You have not placed an order yet.';
      return;
    }
    orders.forEach((order) => {
      const card = document.createElement('section');
      card.className = 'cashier-order';
      const heading = document.createElement('div');
      heading.className = 'cashier-order-heading';
      heading.textContent = `${order.id} · ${order.status}`;
      const details = document.createElement('p');
      details.textContent = `${order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')} — ${formatMoney(order.total)}`;
      const date = document.createElement('p');
      date.textContent = new Date(order.createdAt).toLocaleString();
      card.append(heading, details, date);
      dialogContent.appendChild(card);
    });
  }

  function saveOrderStatus(orderId, status) {
    if (!ORDER_STATUSES.includes(status)) throw new Error('Choose a valid order status.');
    const orders = loadOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) throw new Error('This order could not be found.');
    order.status = status;
    saveRecords(ORDER_KEY, orders);
    renderCashierDashboard();
  }

  function renderCashierDashboard() {
    const orders = loadOrders().sort((first, second) => second.createdAt.localeCompare(first.createdAt));
    openDialog('Cashier dashboard', 'Review customer purchases, record payments, and update order progress.');

    const paidOrders = orders.filter((order) => order.status === 'Paid' || order.status === 'Completed');
    const paidTotal = paidOrders.reduce((sum, order) => sum + order.total, 0);
    const summary = document.createElement('div');
    summary.className = 'cashier-summary';
    [
      [String(orders.length), 'Orders'],
      [String(orders.filter((order) => order.status === 'Awaiting payment').length), 'Awaiting payment'],
      [formatMoney(paidTotal), 'Paid sales']
    ].forEach(([value, label]) => {
      const stat = document.createElement('div');
      stat.className = 'cashier-stat';
      const number = document.createElement('strong');
      number.textContent = value;
      const caption = document.createElement('span');
      caption.textContent = label;
      stat.append(number, caption);
      summary.appendChild(stat);
    });
    dialogContent.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'cashier-orders';
    if (!orders.length) {
      list.textContent = 'No orders yet. Customer purchases will appear here after checkout.';
    }

    orders.forEach((order) => {
      const card = document.createElement('section');
      card.className = 'cashier-order';
      const heading = document.createElement('div');
      heading.className = 'cashier-order-heading';
      heading.textContent = `${order.id} · ${formatMoney(order.total)}`;
      const customer = document.createElement('p');
      customer.textContent = `${order.customerName} (${order.customerEmail})`;
      const items = document.createElement('p');
      items.textContent = order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ');
      const date = document.createElement('p');
      date.textContent = new Date(order.createdAt).toLocaleString();
      const status = document.createElement('select');
      status.className = 'order-status';
      status.setAttribute('aria-label', `Status for ${order.id}`);
      ORDER_STATUSES.forEach((label) => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        option.selected = label === order.status;
        status.appendChild(option);
      });
      status.addEventListener('change', () => {
        try {
          saveOrderStatus(order.id, status.value);
        } catch (error) {
          showToast(error.message || 'Could not update the order.', true);
          renderCashierDashboard();
        }
      });
      card.append(heading, customer, items, date, status);
      list.appendChild(card);
    });
    dialogContent.appendChild(list);
  }

  function createOrder(checkoutDetails = null) {
    if (!cartList.length) throw new Error('Add at least one product before checkout.');
    const adminSale = signedInUser.role === 'admin';
    const items = cartList.reduce((grouped, item) => {
      const existing = grouped.find((entry) => entry.name === item.name && entry.price === Number(item.price));
      if (existing) existing.quantity += 1;
      else grouped.push({ name: item.name, price: Number(item.price), quantity: 1 });
      return grouped;
    }, []);
    const order = {
      id: `FL-${Date.now().toString(36).toUpperCase()}`,
      customerName: adminSale ? 'Walk-in customer' : signedInUser.name,
      customerEmail: adminSale ? 'walk-in' : signedInUser.email,
      items,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      status: adminSale ? 'Paid' : 'Awaiting payment',
      ...(checkoutDetails ? {
        fulfillment: checkoutDetails.fulfillment,
        ...(checkoutDetails.location ? { deliveryLocation: checkoutDetails.location } : {})
      } : {}),
      createdAt: new Date().toISOString()
    };
    const orders = loadOrders();
    orders.push(order);
    saveRecords(ORDER_KEY, orders);
    cartList.length = 0;
    cartCount = 0;
    cartBadge.textContent = '0';
    renderCart();
    return order;
  }

  function finishPendingCheckout() {
    pendingCheckout = false;
    try {
      fulfillmentForm.requestSubmit();
    } catch (error) {
      showToast(error.message || 'Checkout failed.', true);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.account-action');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const mode = button.dataset.accountMode;
    if (mode === 'logout') {
      localStorage.removeItem(SESSION_KEY);
      signedInUser = null;
      updateAccountLinks();
      showToast('You have signed out.');
    } else if (mode === 'register') {
      showRegisterForm();
    } else if (mode === 'login') {
      if (signedInUser) showProfile();
      else showLoginForm();
    } else if (mode === 'track') {
      if (!signedInUser) showLoginForm();
      else if (signedInUser.role === 'admin') renderCashierDashboard();
      else showCustomerOrders();
    }
  }, true);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.checkout-btn')) return;
    if (!cartList.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast('Your cart is empty.', true);
    }
  }, true);

  document.addEventListener('submit', (event) => {
    if (event.target !== fulfillmentForm || !cartList.length || signedInUser) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pendingCheckout = true;
    showLoginForm();
  }, true);

  document.addEventListener('fleuri:payment-ready', (event) => {
    try {
      const order = createOrder(event.detail);
      showToast(`Order ${order.id} created. ${order.status === 'Paid' ? 'Sale recorded.' : 'Awaiting cashier payment.'}`);
    } catch (error) {
      showToast(error.message || 'Checkout failed.', true);
    }
  });

  dialogClose.addEventListener('click', () => {
    pendingCheckout = false;
    dialog.close();
  });
  dialogDone.addEventListener('click', () => {
    pendingCheckout = false;
    dialog.close();
  });
  dialog.addEventListener('cancel', () => {
    pendingCheckout = false;
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      pendingCheckout = false;
      dialog.close();
    }
  });

  ready.then((initialized) => {
    if (!initialized) return;
    try {
      restoreSession();
      updateAccountLinks();
    } catch (error) {
      initializationError = error;
      console.error('Fleuri account restore failed:', error);
      showToast(error.message, true);
    }
  });
})();

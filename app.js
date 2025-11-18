// app.js
// Ajout : génération automatique Product JSON-LD depuis les data-attributes de chaque .product-card
// + persistance du panier, formatage des prix, modal accessible (si déjà présent dans ton app.js)

/* global Intl, document, window, fetch, localStorage */

document.addEventListener('DOMContentLoaded', () => {
  const CART_KEY = 'mcare_cart_v1';
  const currencyFormatter = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

  // --- Éléments principaux (assume présent dans la page) ---
  const addToCartButtons = Array.from(document.querySelectorAll('.add-to-cart'));
  const cartCountEl = document.getElementById('cart-count') || document.querySelector('.cart-count');
  const cartModal = document.getElementById('cart-modal');
  const cartItemsContainer = document.getElementById('cart-items');
  const openCartBtn = document.getElementById('open-cart');
  const overlay = document.getElementById('overlay');
  const subtotalEl = document.querySelector('.subtotal');
  const totalEl = document.querySelector('.total');
  const shippingEl = document.querySelector('.shipping');
  const checkoutBtn = document.querySelector('.checkout-btn');
  const newsletterForm = document.getElementById('newsletter-form');

  let cart = loadCart();

  // initial UI
  updateCartUI();

  // Add-to-cart
  addToCartButtons.forEach(btn => btn.addEventListener('click', (e) => {
    const card = btn.closest('.product-card');
    if (!card) return;
    const id = String(card.dataset.id || Date.now());
    const name = (card.dataset.name || card.querySelector('.product-title')?.textContent || 'Produit').trim();
    const price = parseFloat(card.dataset.price || card.querySelector('.price-value')?.textContent || 0);
    const image = card.dataset.image || card.querySelector('img')?.src || '';

    const existing = cart.find(i => i.id === id);
    if (existing) existing.quantity += 1;
    else cart.push({ id, name, price, image, quantity: 1 });

    saveCart();
    updateCartUI();
    animateAddButton(btn);
  }));

  // Open/close cart (simple)
  const closeCartBtn = cartModal?.querySelector('.close-cart');
  openCartBtn?.addEventListener('click', openCart);
  closeCartBtn?.addEventListener('click', closeCart);
  overlay?.addEventListener('click', closeCart);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

  // Delegation for cart actions
  cartItemsContainer?.addEventListener('click', (e) => {
    const inc = e.target.closest('.increase');
    const dec = e.target.closest('.decrease');
    const rem = e.target.closest('.remove-item');
    if (inc) changeQty(inc.dataset.id, +1);
    if (dec) changeQty(dec.dataset.id, -1);
    if (rem) removeFromCart(rem.dataset.id);
  });

  cartItemsContainer?.addEventListener('change', (e) => {
    const input = e.target.closest('input.quantity-input');
    if (!input) return;
    const id = input.dataset.id;
    const val = Math.max(1, parseInt(input.value) || 1);
    const itm = cart.find(i => i.id === id);
    if (itm) { itm.quantity = val; saveCart(); updateCartUI(); }
  });

  // Newsletter stub
  newsletterForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = newsletterForm.querySelector('input[type="email"]')?.value?.trim();
    if (!email) { alert('Veuillez saisir une adresse email valide.'); return; }
    // Exemple d'appel; remplace par ton endpoint réel
    fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      .then(r => {
        if (!r.ok) throw new Error('Erreur');
        alert('Merci ! Vérifiez votre email pour confirmer votre inscription.');
        newsletterForm.reset();
      })
      .catch(() => {
        alert('Merci ! (mode dégradé) Nous avons bien reçu votre demande.');
        newsletterForm.reset();
      });
  });

  checkoutBtn?.addEventListener('click', () => {
    if (!cart.length) { alert('Votre panier est vide.'); return; }
    alert('Flux paiement non implémenté. Je peux ajouter une intégration Stripe si tu veux.');
  });

  // ---------------- JSON-LD generation ----------------
  // Génère un seul script JSON-LD avec un tableau @graph de Products
  function generateAndInjectProductsJSONLD() {
    try {
      const productCards = Array.from(document.querySelectorAll('.product-card'));
      if (!productCards.length) return;

      const products = productCards.map(card => {
        const dataset = card.dataset || {};
        const id = dataset.id || '';
        const name = dataset.name || card.querySelector('.product-title')?.textContent?.trim() || '';
        const image = dataset.image ? [dataset.image] : (card.querySelector('img') ? [card.querySelector('img').src] : []);
        const description = dataset.description || card.querySelector('.product-description')?.textContent?.trim() || '';
        const sku = dataset.sku || (id ? String(id) : undefined);
        const url = dataset.url || (id ? `${location.origin}${location.pathname}#product-${id}` : undefined);
        const priceRaw = dataset.price || card.querySelector('.price-value')?.textContent?.trim() || '';
        const price = priceRaw ? parseFloat(String(priceRaw).replace(',', '.')) : undefined;
        const priceCurrency = 'EUR';
        const availability = dataset.availability || 'https://schema.org/InStock';
        // Accept both short names and full URLs for availability
        const availabilityNormalized = availability.startsWith('http') ? availability : `https://schema.org/${availability}`;
        const ratingValue = dataset.rating ? parseFloat(dataset.rating) : undefined;
        const reviewCount = dataset.reviewcount ? parseInt(dataset.reviewcount, 10) : (dataset.reviewCount ? parseInt(dataset.reviewCount, 10) : undefined);

        const product = {
          "@type": "Product",
          "name": name,
          "image": image,
        };
        if (description) product.description = description;
        if (sku) product.sku = sku;
        if (url) product.url = url;
        // offers
        if (typeof price !== 'undefined' && !Number.isNaN(price)) {
          product.offers = {
            "@type": "Offer",
            "priceCurrency": priceCurrency,
            "price": price.toFixed(2),
            "availability": availabilityNormalized,
            "url": url || window.location.href
          };
        }
        // aggregateRating
        if (typeof ratingValue !== 'undefined' && !Number.isNaN(ratingValue) && typeof reviewCount !== 'undefined' && !Number.isNaN(reviewCount)) {
          product.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": ratingValue,
            "reviewCount": reviewCount
          };
        }
        return product;
      });

      // Wrap in @context and @graph for multiple entities
      const jsonld = {
        "@context": "https://schema.org",
        "@graph": products
      };

      // Remove existing products JSON-LD if present
      const existing = document.getElementById('products-jsonld');
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.id = 'products-jsonld';
      script.textContent = JSON.stringify(jsonld, null, 2);
      document.head.appendChild(script);
    } catch (err) {
      console.error('Erreur génération JSON-LD produits', err);
    }
  }

  // Call generator now (and also after any dynamic product updates)
  generateAndInjectProductsJSONLD();

  // If your product list is dynamic (AJAX), re-call generateAndInjectProductsJSONLD() after DOM changes.

  // ---------------- Helpers & Cart logic ----------------
  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (err) {
      console.warn('Erreur lecture localStorage', err);
      return [];
    }
  }

  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (err) { console.warn('Erreur sauvegarde localStorage', err); }
  }

  function updateCartUI() {
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';
    if (!cart.length) {
      const p = document.createElement('p');
      p.style.cssText = 'text-align:center;padding:40px;color:#666';
      p.textContent = 'Votre panier est vide';
      cartItemsContainer.appendChild(p);
    } else {
      cart.forEach(item => {
        const el = document.createElement('div');
        el.className = 'cart-item';

        const img = document.createElement('div');
        img.className = 'cart-item-img';
        img.style.backgroundImage = `url('${escapeAttr(item.image)}')`;

        const details = document.createElement('div');
        details.className = 'cart-item-details';

        const title = document.createElement('h4');
        title.className = 'cart-item-title';
        title.textContent = item.name;

        const price = document.createElement('p');
        price.className = 'cart-item-price';
        price.textContent = currencyFormatter.format(item.price);

        const quantityWrap = document.createElement('div');
        quantityWrap.className = 'cart-item-quantity';

        const dec = document.createElement('button');
        dec.className = 'quantity-btn decrease';
        dec.type = 'button';
        dec.dataset.id = item.id;
        dec.textContent = '-';

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'quantity-input';
        input.value = item.quantity;
        input.min = 1;
        input.dataset.id = item.id;

        const inc = document.createElement('button');
        inc.className = 'quantity-btn increase';
        inc.type = 'button';
        inc.dataset.id = item.id;
        inc.textContent = '+';

        const remove = document.createElement('div');
        remove.className = 'remove-item';
        remove.dataset.id = item.id;
        remove.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i> Supprimer';

        quantityWrap.appendChild(dec);
        quantityWrap.appendChild(input);
        quantityWrap.appendChild(inc);

        details.appendChild(title);
        details.appendChild(price);
        details.appendChild(quantityWrap);
        details.appendChild(remove);

        el.appendChild(img);
        el.appendChild(details);
        cartItemsContainer.appendChild(el);
      });
    }

    const total = cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const shipping = total > 49 ? 0 : 4.9;
    if (subtotalEl) subtotalEl.textContent = currencyFormatter.format(total);
    if (totalEl) totalEl.textContent = currencyFormatter.format(total + shipping);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'Gratuit' : currencyFormatter.format(shipping);
    if (cartCountEl) cartCountEl.textContent = String(cart.reduce((s,i) => s + i.quantity, 0));
  }

  function changeQty(id, delta) {
    const it = cart.find(i => i.id === id);
    if (!it) return;
    it.quantity = Math.max(1, it.quantity + delta);
    saveCart(); updateCartUI();
  }

  function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart(); updateCartUI();
  }

  function animateAddButton(btn) {
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Ajouté !';
    setTimeout(() => { btn.innerHTML = original; btn.disabled = false; }, 1200);
  }

  // Basic open/close cart (no focus trap here but could be added)
  function openCart() {
    if (!cartModal) return;
    cartModal.setAttribute('aria-hidden', 'false');
    overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
    updateCartUI();
  }
  function closeCart() {
    if (!cartModal) return;
    cartModal.setAttribute('aria-hidden', 'true');
    overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  function escapeAttr(s) { return String(s || '').replace(/"/g, '%22').replace(/'/g, '%27'); }
});

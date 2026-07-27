const menuBtn = document.getElementById("menu-btn");
const mobileNav = document.getElementById("mobile-nav");
if (menuBtn && mobileNav) {
  menuBtn.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
  });
}

const FORM_ENDPOINT = "https://formsubmit.co/ajax/support@elevaro.website";

function formSubject(form) {
  const page = document.title.replace(/\s*\|.*$/, "").trim() || "Elevaro";
  return `Elevaro lead — ${page}`;
}

function setFormStatus(form, type, message) {
  let status = form.querySelector(".form-status");
  if (!status) {
    status = document.createElement("p");
    status.className = "form-status";
    form.appendChild(status);
  }
  status.className = `form-status ${type}`;
  status.textContent = message;
}

function fieldValue(form, id) {
  const el = form.querySelector(`#${id}`);
  return el ? String(el.value || "").trim() : "";
}

document.querySelectorAll('[class*="__leadForm"]').forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = fieldValue(form, "name");
    const email = fieldValue(form, "email");
    const message = fieldValue(form, "message");

    if (!name || !email || !message) {
      setFormStatus(
        form,
        "error",
        "Please fill in your name, email, and message.",
      );
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const defaultLabel =
      submitBtn?.querySelector("span")?.textContent ||
      submitBtn?.textContent ||
      "Send message";
    if (submitBtn) {
      submitBtn.disabled = true;
      const label = submitBtn.querySelector("span");
      if (label) label.textContent = "Sending…";
      else submitBtn.textContent = "Sending…";
    }

    const payload = new FormData();
    payload.append("name", name);
    payload.append("email", email);
    payload.append("phone", fieldValue(form, "phone"));
    payload.append("company", fieldValue(form, "company"));
    payload.append("message", message);
    payload.append("_subject", formSubject(form));
    payload.append("_template", "table");
    payload.append("_captcha", "false");

    try {
      const response = await fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: payload,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.message || "Unable to send your message right now.",
        );
      }
      form.reset();
      setFormStatus(
        form,
        "success",
        "Message sent — we will respond within one business day.",
      );
    } catch (error) {
      setFormStatus(
        form,
        "error",
        error.message ||
          "Something went wrong. Email support@elevaro.website instead.",
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const label = submitBtn.querySelector("span");
        if (label) label.textContent = defaultLabel;
        else submitBtn.textContent = defaultLabel;
      }
    }
  });
});

const packageGrid = document.getElementById("package-grid");
const serviceGrid = document.getElementById("service-grid");
const serviceTabs = document.getElementById("service-tabs");
const checkoutBar = document.getElementById("pricing-checkout");
const selectionLabel = document.getElementById("pricing-selection");
const checkoutBtn = document.getElementById("pricing-checkout-btn");
const quoteModal = document.getElementById("quote-modal");
const quoteForm = document.getElementById("quote-form");
const quoteSummary = document.getElementById("quote-selection-summary");

const leadConfig = () => window.ELEVARO_LEAD_CONFIG || {};

function referrerDomain() {
  const config = leadConfig();
  return config.referrerDomain || window.location.hostname || "localhost";
}

function makeExternalId() {
  return `quote-${referrerDomain()}-${Date.now()}`;
}

function buildSelectionSummary(selection) {
  const lines = [];
  if (selection.package) lines.push(`Package: ${selection.package}`);
  if (selection.services.length) {
    lines.push("Services:");
    selection.services.forEach((service) => lines.push(`- ${service}`));
  }
  return lines.join("\n");
}

function buildLeadMessage(selection, extraMessage) {
  const parts = [
    "Quote request from pricing page.",
    buildSelectionSummary(selection),
  ];
  if (extraMessage) parts.push("", "Additional notes:", extraMessage);
  return parts.join("\n");
}

async function submitFormsubmitLead({
  contactName,
  email,
  businessName,
  phone,
  message,
  selection,
}) {
  const config = leadConfig();
  const emailTarget = config.formsubmitEmail || "support@elevaro.website";
  const payload = new FormData();
  payload.append("name", contactName);
  payload.append("email", email);
  payload.append("phone", phone);
  payload.append("company", businessName || "");
  payload.append("message", message);
  payload.append("selection", buildSelectionSummary(selection));
  payload.append("_subject", `Elevaro quote request — ${referrerDomain()}`);
  payload.append("_template", "table");
  payload.append("_captcha", "false");

  const response = await fetch(
    `https://formsubmit.co/ajax/${encodeURIComponent(emailTarget)}`,
    {
      method: "POST",
      headers: { Accept: "application/json" },
      body: payload,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data.message || "Unable to send your quote request by email.",
    );
  }
}

async function submitIngestLead({
  contactName,
  email,
  businessName,
  phone,
  message,
  selection,
  externalId,
}) {
  const config = leadConfig();
  if (!config.apiKey) {
    throw new Error(
      "Lead API key is not configured. Set ELEVARO_LEAD_CONFIG.apiKey in assets/lead-config.js.",
    );
  }

  const response = await fetch(
    config.ingestUrl || "https://api.elevarosolutions.com/ingest/leads",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "x-referrer-domain": referrerDomain(),
      },
      body: JSON.stringify({
        contactName,
        email,
        businessName: businessName || undefined,
        phone,
        topic: "Quote request",
        message,
        externalId,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Lead ingest failed (${response.status})`);
  }

  return response.json();
}

if (packageGrid || serviceGrid) {
  const selected = { package: null, services: new Set() };
  const selectedClass = (el, on, cls) => el.classList.toggle(cls, on);

  function currentSelection() {
    return {
      package: selected.package,
      services: [...selected.services],
    };
  }

  function updateCheckout() {
    if (!checkoutBar || !selectionLabel) return;
    const parts = [];
    if (selected.package) parts.push(`${selected.package} package`);
    if (selected.services.size) {
      parts.push(
        `${selected.services.size} service${selected.services.size === 1 ? "" : "s"}`,
      );
    }
    const hasSelection = parts.length > 0;
    checkoutBar.hidden = !hasSelection;
    selectionLabel.textContent = hasSelection
      ? parts.join(" · ")
      : "Nothing selected yet";
  }

  function openQuoteModal() {
    if (!quoteModal || !quoteSummary) return;
    const selection = currentSelection();
    quoteSummary.textContent = buildSelectionSummary(selection);
    quoteModal.hidden = false;
    document.body.classList.add("quote-modal-open");
    quoteForm?.querySelector("#quote-name")?.focus();
  }

  function closeQuoteModal() {
    if (!quoteModal) return;
    quoteModal.hidden = true;
    document.body.classList.remove("quote-modal-open");
  }

  packageGrid?.querySelectorAll("[data-package]").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.dataset.package;
      const on = selected.package !== name;
      selected.package = on ? name : null;
      packageGrid.querySelectorAll("[data-package]").forEach((el) => {
        selectedClass(
          el,
          el.dataset.package === selected.package,
          "catalog-module__j-Dk-a__packageCardSelected",
        );
      });
      updateCheckout();
    });
  });

  serviceGrid?.querySelectorAll("[data-service]").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.dataset.service;
      if (selected.services.has(name)) selected.services.delete(name);
      else selected.services.add(name);
      selectedClass(
        card,
        selected.services.has(name),
        "catalog-module__j-Dk-a__standaloneCardSelected",
      );
      updateCheckout();
    });
  });

  serviceTabs?.querySelectorAll(".pricing-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const category = tab.dataset.category;
      serviceTabs.querySelectorAll(".pricing-tab").forEach((t) => {
        t.classList.toggle("pricing-tab-active", t === tab);
      });
      serviceGrid?.querySelectorAll("[data-category]").forEach((card) => {
        const show = category === "all" || card.dataset.category === category;
        card.style.display = show ? "" : "none";
      });
    });
  });

  checkoutBtn?.addEventListener("click", () => {
    if (!selected.package && selected.services.size === 0) return;
    openQuoteModal();
  });

  quoteModal?.querySelectorAll("[data-quote-close]").forEach((el) => {
    el.addEventListener("click", closeQuoteModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && quoteModal && !quoteModal.hidden)
      closeQuoteModal();
  });

  quoteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selection = currentSelection();
    const contactName = fieldValue(quoteForm, "quote-name");
    const email = fieldValue(quoteForm, "quote-email");
    const businessName = fieldValue(quoteForm, "quote-business");
    const phone = fieldValue(quoteForm, "quote-phone");
    const extraMessage = fieldValue(quoteForm, "quote-message");
    const message = buildLeadMessage(selection, extraMessage);
    const externalId = makeExternalId();

    if (!contactName || !email || !phone) {
      setFormStatus(
        quoteForm,
        "error",
        "Please fill in your name, email, and phone.",
      );
      return;
    }

    const submitBtn = quoteForm.querySelector('button[type="submit"]');
    const defaultLabel =
      submitBtn?.querySelector("span")?.textContent || "Send quote request";
    if (submitBtn) {
      submitBtn.disabled = true;
      const label = submitBtn.querySelector("span");
      if (label) label.textContent = "Sending…";
      else submitBtn.textContent = "Sending…";
    }

    try {
      await Promise.all([
        submitFormsubmitLead({
          contactName,
          email,
          businessName,
          phone,
          message,
          selection,
        }),
        submitIngestLead({
          contactName,
          email,
          businessName,
          phone,
          message,
          selection,
          externalId,
        }),
      ]);
      quoteForm.reset();
      setFormStatus(
        quoteForm,
        "success",
        "Quote request sent — we will respond within one business day.",
      );
      setTimeout(closeQuoteModal, 1800);
    } catch (error) {
      setFormStatus(
        quoteForm,
        "error",
        error.message ||
          "Something went wrong. Email support@elevaro.website instead.",
      );
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        const label = submitBtn.querySelector("span");
        if (label) label.textContent = defaultLabel;
        else submitBtn.textContent = defaultLabel;
      }
    }
  });
}

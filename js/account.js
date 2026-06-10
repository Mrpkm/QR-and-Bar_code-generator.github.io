/* Account UI: header sign-in/out controls and the auth modal.
 * In local-only mode (no cloud config) every element stays hidden and this
 * module does nothing beyond Backend.init(), which resolves immediately.
 */
(function () {
  "use strict";

  var els = {
    area: document.getElementById("account-area"),
    name: document.getElementById("account-name"),
    signinBtn: document.getElementById("account-signin"),
    signoutBtn: document.getElementById("account-signout"),
    modal: document.getElementById("auth-modal"),
    close: document.getElementById("auth-close"),
    modeSignin: document.getElementById("auth-mode-signin"),
    modeSignup: document.getElementById("auth-mode-signup"),
    form: document.getElementById("auth-form"),
    username: document.getElementById("auth-username"),
    password: document.getElementById("auth-password"),
    typeFieldset: document.getElementById("auth-type-fieldset"),
    warning: document.getElementById("auth-warning"),
    error: document.getElementById("auth-error"),
    submit: document.getElementById("auth-submit"),
    trackRow: document.getElementById("qr-track-row")
  };

  var mode = "signin"; // or "signup"

  function setMode(next) {
    mode = next;
    var signup = mode === "signup";
    els.modeSignin.classList.toggle("active", !signup);
    els.modeSignup.classList.toggle("active", signup);
    els.typeFieldset.hidden = !signup;
    els.warning.hidden = !signup;
    els.submit.textContent = signup ? "Create account" : "Sign in";
    els.password.autocomplete = signup ? "new-password" : "current-password";
    showError("");
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = !message;
  }

  function openModal() {
    showError("");
    els.modal.hidden = false;
    els.username.focus();
  }

  function closeModal() {
    els.modal.hidden = true;
    els.form.reset();
    showError("");
  }

  function accountType() {
    return els.form.querySelector('input[name="auth-type"]:checked').value;
  }

  function onAuthChange(profile) {
    var signedIn = !!profile;
    els.name.hidden = !signedIn;
    els.name.textContent = signedIn ? profile.username : "";
    els.signinBtn.hidden = signedIn;
    els.signoutBtn.hidden = !signedIn;
    // Scan tracking is only offered to signed-in users (the link must belong to someone).
    els.trackRow.hidden = !signedIn;
    if (!signedIn) {
      var track = document.getElementById("qr-track");
      if (track) track.checked = false;
    }
  }

  function offerHistoryMerge() {
    Backend.hasUnmergedHistory().then(function (count) {
      if (!count) return;
      var ok = window.confirm(
        "This browser has " + count + " code generation" + (count === 1 ? "" : "s") +
        " from before you signed in. Import them into your account's analytics?");
      if (ok) Backend.mergeGuestHistory();
      else CSStorage.kvSet("merged:" + Backend.currentUser().id, true); // asked once, respect the answer
    });
  }

  function submit(e) {
    e.preventDefault();
    var username = els.username.value.trim();
    var password = els.password.value;
    els.submit.disabled = true;
    var action = mode === "signup"
      ? Backend.signUp(username, password, accountType())
      : Backend.signIn(username, password);
    action.then(function () {
      els.submit.disabled = false;
      var wasSignIn = mode === "signin";
      closeModal();
      if (wasSignIn) offerHistoryMerge();
    }, function (err) {
      els.submit.disabled = false;
      showError(err && err.message ? err.message : "Something went wrong. Please try again.");
    });
  }

  if (!Backend.isCloud()) {
    Backend.init();
    return;
  }

  els.area.hidden = false;
  Backend.onAuth(onAuthChange);
  Backend.init();

  els.signinBtn.addEventListener("click", openModal);
  els.signoutBtn.addEventListener("click", function () { Backend.signOut(); });
  els.close.addEventListener("click", closeModal);
  els.modal.addEventListener("click", function (e) { if (e.target === els.modal) closeModal(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.modal.hidden) closeModal();
  });
  els.modeSignin.addEventListener("click", function () { setMode("signin"); });
  els.modeSignup.addEventListener("click", function () { setMode("signup"); });
  els.form.addEventListener("submit", submit);
  setMode("signin");
})();

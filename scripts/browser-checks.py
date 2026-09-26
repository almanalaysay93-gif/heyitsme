"""Browser regression checks for F1-F7 (privacy chunk recovery, validation focus, demo actions, share/copy, support).
Needs Python Playwright. Usage: python scripts/browser-checks.py https://heyitsme.fyi"""
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3997"
results = []


def ok(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" — {detail}" if detail else ""))


with sync_playwright() as p:
    b = p.chromium.launch()

    # A1: privacy renders (direct + client nav), and a stale chunk recovers instead of showing the crash screen.
    pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/privacy"); pg.wait_for_timeout(1500)
    body = pg.inner_text("body")
    ok("A1 /privacy direct renders policy", "Google" in body and "sideways" not in body.lower(), f"errors={errs[:1]}")
    pg.goto(f"{BASE}/c/demo"); pg.wait_for_timeout(1500)
    state = {"n": 0}
    def stale(route):
        state["n"] += 1
        if state["n"] == 1:
            route.fulfill(status=404, content_type="text/html", body="<!doctype html>gone")
        else:
            route.continue_()
    pg.route("**/assets/Legal-*.js", stale)
    pg.evaluate("sessionStorage.removeItem('heyitsme.chunk-reload-at')")
    pg.click("footer >> text=Privacy"); pg.wait_for_timeout(3500)
    body = pg.inner_text("body")
    ok("A1 stale chunk auto-recovers to the policy", "Google" in body and "sideways" not in body.lower(), f"chunk requests={state['n']}")

    # A1: persistent failure shows the honest update screen, and navigating away clears it.
    pg2 = b.new_page(viewport={"width": 390, "height": 844})
    pg2.goto(f"{BASE}/c/demo"); pg2.wait_for_timeout(1500)
    pg2.evaluate("sessionStorage.setItem('heyitsme.chunk-reload-at', String(Date.now()))")
    pg2.route("**/assets/Legal-*.js", lambda r: r.fulfill(status=404, content_type="text/html", body="gone"))
    pg2.click("footer >> text=Privacy"); pg2.wait_for_timeout(2000)
    ok("A1 repeated failure shows update screen", "was just updated" in pg2.inner_text("body"))
    pg2.click("text=Back to heyitsme"); pg2.wait_for_timeout(2000)
    ok("A1 error screen releases after navigation", "was just updated" not in pg2.inner_text("body"))

    # A3: empty save shows error, focuses the name field, saves nothing.
    pg3 = b.new_page(viewport={"width": 390, "height": 844})
    pg3.goto(f"{BASE}/app/cards/new"); pg3.wait_for_timeout(2500)
    pg3.evaluate("localStorage.removeItem('heyitsme.preview.card')")
    pg3.click("button:has-text('Save card')"); pg3.wait_for_timeout(1200)
    focused = pg3.evaluate("document.activeElement && document.activeElement.id")
    saved = pg3.evaluate("localStorage.getItem('heyitsme.preview.card')")
    ok("A3 empty save focuses the name field", focused == "field-displayName", f"focused={focused}")
    ok("A3 empty save persists nothing", saved is None)
    pg3.fill("#field-displayName", "Test Person"); pg3.fill("#field-email", "bad-email")
    pg3.click("button:has-text('Save card')"); pg3.wait_for_timeout(1200)
    focused = pg3.evaluate("document.activeElement && document.activeElement.id")
    ok("A3 invalid email is focused", focused == "field-email", f"focused={focused}")

    # A5: demo booking and phone explain themselves, no new tab.
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    pg4 = ctx.new_page(); pg4.goto(f"{BASE}/c/demo"); pg4.wait_for_timeout(1500)
    pages_before = len(ctx.pages)
    pg4.click(".lx-hero a.lx-btn-primary"); pg4.wait_for_timeout(800)
    ok("A5 demo booking opens an in-page explanation", "Nothing was booked" in pg4.inner_text("body") and len(ctx.pages) == pages_before)
    pg4.keyboard.press("Escape"); pg4.wait_for_timeout(400)
    phone = pg4.query_selector(".lx-contact a[href^='tel:']")
    ok("A5 demo phone is present", phone is not None)
    if phone:
        phone.scroll_into_view_if_needed(); phone.click(); pg4.wait_for_timeout(800)
        ok("A5 demo phone explains instead of dialling", "fictional number" in pg4.inner_text("body"))
        pg4.keyboard.press("Escape")

    # A6: copy link with clipboard permission -> "Link copied."; denied -> manual copy dialog.
    ctx2 = b.new_context(viewport={"width": 1280, "height": 900}, permissions=["clipboard-read", "clipboard-write"])
    pg5 = ctx2.new_page(); pg5.goto(f"{BASE}/c/demo"); pg5.wait_for_timeout(1500)
    pg5.click("button[aria-label='Copy link to this page']"); pg5.wait_for_timeout(700)
    ok("A6 Copy link says copied after a real copy", "Link copied." in pg5.inner_text("body"))
    pg6 = b.new_page(viewport={"width": 390, "height": 844}); pg6.goto(f"{BASE}/c/demo"); pg6.wait_for_timeout(1200)
    pg6.evaluate("""() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); document.execCommand = () => false; }""")
    pg6.click("button[aria-label='Copy link to this page']"); pg6.wait_for_timeout(700)
    txt = pg6.inner_text("body")
    ok("A6 denied clipboard shows the link to copy by hand", "Copy this link" in txt and "Link copied." not in txt)
    pg6.keyboard.press("Escape")
    pg6.evaluate("() => { navigator.share = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' })); }")
    pg6.click(".lx-nav >> text=Share"); pg6.wait_for_timeout(700)
    ok("A6 cancelled native share stays quiet", "Link copied." not in pg6.inner_text("body") and "Copy this link" not in pg6.inner_text("body"))

    # A7: Support opens a dialog with the address, no mailto navigation.
    pg7 = b.new_page(viewport={"width": 1280, "height": 900}); pg7.goto(f"{BASE}/privacy"); pg7.wait_for_timeout(1500)
    btn = pg7.query_selector("button.legal-links-button")
    if btn:
        btn.click(); pg7.wait_for_timeout(600)
        val = pg7.eval_on_selector(".info-dialog-value", "e => e.value") if pg7.query_selector(".info-dialog-value") else ""
        ok("A7 Support opens contact dialog with address", "@" in val and "Open email app" in pg7.inner_text("body"), val)
    else:
        ok("A7 Support button present (needs VITE_SUPPORT_EMAIL at build)", False)
    b.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)

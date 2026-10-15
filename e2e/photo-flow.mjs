import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", err => errors.push(err.message));
const origin = process.env.TEST_URL || "http://127.0.0.1:4173";
try {
  await page.goto(origin);
  await page.locator("#startButton").click();
  assert.equal(await page.locator(".post-card").count(), 0);
  await page.locator("#analyzeButton").click();
  await page.locator("#newError:not(.hidden)").waitFor();

  // Generate actual image pixels. The filename contains no private information.
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 500;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1200, 500);
    ctx.fillStyle = "black"; ctx.font = "48px Arial";
    ctx.fillText("Name: Alice Smith", 60, 100);
    ctx.fillText("Riverside School", 60, 200);
    ctx.fillText("alice@example.com", 60, 300);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#newImage").setInputFiles({ name:"photo.png", mimeType:"image/png", buffer:Buffer.from(data,"base64") });
  await page.locator("#newPreview").waitFor({state:"visible"});
  await page.locator("#addExistingButton").click();
  await page.locator("#existingText").fill("매주 화요일 8시 Riverside School 수업");
  await page.locator("#existingForm button[type=submit]").click();
  await page.locator("#analyzeButton").click();
  await page.locator("#results:not(.hidden)").waitFor({timeout:120000});
  const evidence = await page.locator(".evidence").innerText();
  assert.match(evidence, /alice@example\.com/i);
  assert.match(evidence, /사진에서 읽음/);
  assert.match(await page.locator(".ocr-text").textContent(), /Riverside School/i);
  assert.ok(await page.locator("#autoMask").count());
  assert.ok(await page.locator("#cleanupPosts").count());
  console.log("PASS: neutral filename photo produced actual name, school, email and cross-post connections");

  await page.locator("#autoMask").click();
  await page.locator("#results:not(.hidden) .compare").waitFor({timeout:120000});
  assert.match(await page.locator(".compare").innerText(), /감소했어요/);
  assert.doesNotMatch(await page.locator(".ocr-text").textContent(), /alice@example\.com/i);
  console.log("PASS: automatic masking changed pixels and re-OCR confirmed removal");

  await page.locator("#undoAction").click();
  await page.locator("#cleanupPosts").click();
  await page.locator("#results:not(.hidden) .compare").waitFor({timeout:120000});
  assert.equal(await page.locator(".post-card").count(), 0);
  await page.locator("#undoAction").click();
  assert.equal(await page.locator(".post-card").count(), 1);
  console.log("PASS: detected linked posts deleted and restored with undo");

  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  console.log("PASS: mobile layout has no horizontal overflow");
  assert.deepEqual(errors, []);
  const koreanData = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width=1400; canvas.height=400;
    const ctx=canvas.getContext("2d"); ctx.fillStyle="white"; ctx.fillRect(0,0,1400,400); ctx.fillStyle="black";
    ctx.font='70px "Apple SD Gothic Neo"'; ctx.fillText("한빛고등학교",70,130); ctx.fillText("이름: 김민수",70,260);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#newImage").setInputFiles({name:"korean.png",mimeType:"image/png",buffer:Buffer.from(koreanData,"base64")});
  await page.waitForTimeout(200);
  await page.locator("#analyzeButton").click();
  await page.locator("#results:not(.hidden)").waitFor({timeout:120000});
  assert.match(await page.locator(".ocr-text").textContent(), /고등학교/);
  console.log("PASS: actual Korean school text read from image pixels");

  // A filename containing private keywords must not create image findings.
  const blankData=await page.evaluate(()=>{const c=document.createElement("canvas");c.width=300;c.height=300;const x=c.getContext("2d");x.fillStyle="white";x.fillRect(0,0,300,300);return c.toDataURL("image/png").split(",")[1]});
  await page.locator("#newImage").setInputFiles({name:"이름표_학교_학원.png",mimeType:"image/png",buffer:Buffer.from(blankData,"base64")});
  await page.waitForTimeout(200);
  await page.locator("#analyzeButton").click();
  await page.locator("#results:not(.hidden)").waitFor({timeout:120000});
  assert.doesNotMatch(await page.locator(".evidence").innerText(), /사진에서 읽음/);
  console.log("PASS: blank image with sensitive filename produces no image findings");

  const failurePage=await browser.newPage();
  await failurePage.route("**/vendor/worker.min.js",route=>route.abort());
  await failurePage.goto(origin); await failurePage.locator("#startButton").click();
  await failurePage.locator("#newImage").setInputFiles({name:"photo.png",mimeType:"image/png",buffer:Buffer.from(data,"base64")});
  await failurePage.waitForTimeout(200); await failurePage.locator("#analyzeButton").click();
  await failurePage.locator("#newError:not(.hidden)").waitFor({timeout:15000});
  assert.equal(await failurePage.locator("#results").isVisible(),false);
  assert.equal(await failurePage.locator("#analyzeButton").isEnabled(),true);
  await failurePage.close();
  console.log("PASS: OCR loading failure shows error instead of low-risk result");
} finally { await browser.close(); }

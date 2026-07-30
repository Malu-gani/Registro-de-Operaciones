import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { extraerLinkDeAuth, leerUltimoMail } from "./helpers/mail";

const PASSWORD = "Prueba1234!";
const PASSWORD_NUEVA = "Nueva5678!";

async function registrar(page: Page, email: string) {
  await page.goto("/signup");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
}

test("registro: sin confirmar no entra; tras seguir el link del mail, sí", async ({
  page,
}) => {
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);

  // Intento de login sin confirmar: ve el aviso y la opción de reenviar.
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByText(/no confirmaste tu email/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar email de confirmación" })
  ).toBeVisible();

  // Confirma siguiendo el link del mail y ahora sí entra.
  const cuerpo = await leerUltimoMail(email);
  await page.goto(extraerLinkDeAuth(cuerpo));
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
});

test("reenvío de confirmación manda un segundo mail", async ({ page }) => {
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);
  await leerUltimoMail(email); // primer mail (el del alta)

  // Supabase impone un intervalo mínimo entre correos (max_frequency = 1s):
  // esperamos a superarlo, si no el reenvío rebota con "esperá unos segundos".
  await page.waitForTimeout(1500);

  await page.goto("/login?sinConfirmar=1&error=x");
  await page.getByPlaceholder("Reingresá tu email").fill(email);
  await page.getByRole("button", { name: "Reenviar email de confirmación" }).click();
  await expect(page.getByText(/te reenviamos el correo/i)).toBeVisible();
});

test("recuperación: pido enlace, elijo contraseña nueva y entro con ella", async ({
  page,
}) => {
  // Registro + confirmación para tener una cuenta usable.
  const email = `e2e-${randomUUID()}@ejemplo.test`;
  await registrar(page, email);
  await page.goto(extraerLinkDeAuth(await leerUltimoMail(email)));
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
  await page.getByRole("button", { name: "Salir" }).click();

  // Pido recuperación.
  await page.goto("/forgot-password");
  await page.locator('input[name="email"]').fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si el email está registrado/i)).toBeVisible();

  // Sigo el link (el mail más reciente es el de recuperación) y fijo la nueva.
  await page.goto(extraerLinkDeAuth(await leerUltimoMail(email)));
  await expect(page).toHaveURL(/\/reset-password/, { timeout: 30000 });
  await page.locator('input[name="password"]').fill(PASSWORD_NUEVA);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD_NUEVA);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });

  // Cierro sesión y entro con la contraseña NUEVA.
  await page.getByRole("button", { name: "Salir" }).click();
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD_NUEVA);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
});

test("anti-enumeración: forgot con email inexistente da el mismo mensaje", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page
    .locator('input[name="email"]')
    .fill(`no-existe-${randomUUID()}@ejemplo.test`);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  await expect(page.getByText(/si el email está registrado/i)).toBeVisible();
});

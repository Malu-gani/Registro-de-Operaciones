import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import PasswordInput from "@/components/PasswordInput";

describe("PasswordInput", () => {
  test("arranca oculta (type password)", () => {
    render(<PasswordInput data-testid="campo" name="password" />);

    expect(screen.getByTestId("campo")).toHaveAttribute("type", "password");
  });

  test("clickear el ícono la muestra en texto plano", async () => {
    const user = userEvent.setup();
    render(<PasswordInput data-testid="campo" name="password" />);

    await user.click(screen.getByRole("button", { name: /mostrar contraseña/i }));

    expect(screen.getByTestId("campo")).toHaveAttribute("type", "text");
  });

  test("clickear de nuevo la vuelve a ocultar", async () => {
    const user = userEvent.setup();
    render(<PasswordInput data-testid="campo" name="password" />);

    await user.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    await user.click(screen.getByRole("button", { name: /ocultar contraseña/i }));

    expect(screen.getByTestId("campo")).toHaveAttribute("type", "password");
  });

  test("reenvía el resto de las props al input (name, required, value, onChange)", async () => {
    const user = userEvent.setup();
    let valor = "";
    const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      valor = e.target.value;
    };

    render(
      <PasswordInput
        data-testid="campo"
        name="password"
        required
        value={valor}
        onChange={onChange}
      />
    );

    const input = screen.getByTestId("campo");
    expect(input).toHaveAttribute("name", "password");
    expect(input).toBeRequired();

    await user.type(input, "a");
    expect(valor).toBe("a");
  });
});

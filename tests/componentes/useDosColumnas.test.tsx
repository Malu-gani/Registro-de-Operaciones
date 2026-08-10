import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useDosColumnas } from "@/hooks/useDosColumnas";

let callbacks: ResizeObserverCallback[] = [];

class FakeResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    callbacks.push(callback);
  }
  observe() {}
  disconnect() {}
}

function dispararAncho(width: number) {
  const entry = { contentRect: { width } } as ResizeObserverEntry;
  callbacks.forEach((cb) => cb([entry], {} as ResizeObserver));
}

beforeEach(() => {
  callbacks = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

function Caja({ breakpointPx }: { breakpointPx: number }) {
  const { ref, dosColumnas } = useDosColumnas<HTMLDivElement>(breakpointPx);
  return <div ref={ref} data-testid="caja">{dosColumnas ? "dos" : "una"}</div>;
}

describe("useDosColumnas", () => {
  test("arranca en una columna antes de la primera medición", () => {
    render(<Caja breakpointPx={512} />);

    expect(screen.getByTestId("caja").textContent).toBe("una");
  });

  test("pasa a dos columnas cuando el ancho medido alcanza el breakpoint", () => {
    render(<Caja breakpointPx={512} />);

    act(() => dispararAncho(600));

    expect(screen.getByTestId("caja").textContent).toBe("dos");
  });

  test("vuelve a una columna si el ancho medido baja del breakpoint", () => {
    render(<Caja breakpointPx={512} />);

    act(() => dispararAncho(600));
    act(() => dispararAncho(400));

    expect(screen.getByTestId("caja").textContent).toBe("una");
  });

  test("un ancho exactamente igual al breakpoint cuenta como dos columnas", () => {
    render(<Caja breakpointPx={512} />);

    act(() => dispararAncho(512));

    expect(screen.getByTestId("caja").textContent).toBe("dos");
  });
});

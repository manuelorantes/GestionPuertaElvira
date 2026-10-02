import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { useDebouncedValue } from '@/shared/useDebouncedValue';

import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { DateField } from './DateField';
import { SidePanel } from './SidePanel';

describe('DateField', () => {
  function Harness({ initial = '' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <DateField
          label="Fecha de nacimiento"
          value={value}
          onChange={setValue}
          fromYear={2000}
          toYear={2026}
        />
        <output role="status">{value || 'vacío'}</output>
      </>
    );
  }

  it('should order day, month and year and emit an ISO date only when complete', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const selects = screen.getAllByRole('combobox');
    expect(selects.map((select) => select.getAttribute('aria-label'))).toEqual([
      'Día',
      'Mes',
      'Año',
    ]);

    await user.selectOptions(screen.getByLabelText('Día'), '7');
    expect(screen.getByRole('status')).toHaveTextContent('vacío');
    await user.selectOptions(screen.getByLabelText('Mes'), 'marzo');
    await user.selectOptions(screen.getByLabelText('Año'), '2014');

    expect(screen.getByRole('status')).toHaveTextContent('2014-03-07');
  });

  it('should show an existing value and its group label', () => {
    render(<Harness initial="2014-03-12" />);

    expect(screen.getByRole('group', { name: 'Fecha de nacimiento' })).toBeVisible();
    expect(screen.getByLabelText('Día')).toHaveValue('12');
    expect(screen.getByLabelText('Año')).toHaveValue('2014');
  });
});

describe('ConfirmDialog', () => {
  it('should focus cancel and report the decision', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Grupo completo"
        message="¿Inscribir igualmente?"
        confirmLabel="Inscribir igualmente"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Inscribir igualmente' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('SidePanel and Avatar', () => {
  it('should render a labelled dialog that closes with escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SidePanel labelledBy="t" onClose={onClose}>
        <h2 id="t">Martina López</h2>
        <Avatar name="Martina López Herrera" />
      </SidePanel>,
    );

    expect(screen.getByRole('dialog', { name: 'Martina López' })).toBeVisible();
    expect(screen.getByText('ML')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SidePanel escape', () => {
  it('should close with escape even when focus has fallen back to the page', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <SidePanel labelledBy="t" onClose={onClose}>
        <h2 id="t">Ficha</h2>
      </SidePanel>,
    );

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});

describe('useDebouncedValue', () => {
  it('should update only after the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe('ab');
    vi.useRealTimers();
  });
});

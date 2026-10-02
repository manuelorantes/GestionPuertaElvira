import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Badge } from './Badge';
import { OccupancyBar } from './OccupancyBar';
import { SectionHeader } from './SectionHeader';
import { Select } from './Select';
import { Switch } from './Switch';
import { Tabs } from './Tabs';
import { ToastProvider, useToast } from './Toast';
import { ToggleButton } from './ToggleButton';

describe('Tabs', () => {
  function Harness() {
    const [value, setValue] = useState('a');
    return (
      <Tabs
        label="Vistas"
        value={value}
        onChange={setValue}
        tabs={[
          { id: 'a', label: 'Horario' },
          { id: 'b', label: 'Grupos' },
        ]}
      >
        <p>Panel {value}</p>
      </Tabs>
    );
  }

  it('should select tabs by click and arrow keys and label the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.getByRole('tab', { name: 'Horario' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('tab', { name: 'Grupos' }));
    expect(screen.getByRole('tabpanel', { name: 'Grupos' })).toHaveTextContent('Panel b');

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Horario' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Horario' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('form controls', () => {
  it('should label a select and show its error', () => {
    render(
      <Select
        label="Nivel"
        options={[{ value: 'a', label: 'Iniciación' }]}
        value="a"
        onChange={() => {}}
        error="Elige un nivel"
      />,
    );

    expect(screen.getByLabelText('Nivel')).toHaveAccessibleDescription('Elige un nivel');
  });

  it('should expose pressed state in toggle buttons and checked state in switches', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <>
        <ToggleButton pressed onClick={onToggle}>
          Lun
        </ToggleButton>
        <Switch label="Activo" checked={false} onChange={onToggle} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Lun' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('switch', { name: 'Activo' }));
    expect(screen.getByRole('switch', { name: 'Activo' })).toHaveAttribute('aria-checked', 'false');
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});

describe('display primitives', () => {
  it('should show occupancy as a meter and flag over capacity', () => {
    render(<OccupancyBar occupied={13} capacity={12} />);

    expect(screen.getByRole('meter', { name: 'Ocupación' })).toHaveAttribute('aria-valuenow', '13');
    expect(screen.getByText('13/12')).toBeVisible();
    expect(screen.getByText('Sobre el cupo')).toBeVisible();
  });

  it('should render badges and section headers with their action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <>
        <Badge tone="success">Activo</Badge>
        <SectionHeader
          eyebrow="2 aulas"
          title="Clases"
          action={{ label: 'Nuevo grupo', onClick: onAction }}
        />
      </>,
    );

    expect(screen.getByText('Activo')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Clases' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Nuevo grupo' }));
    expect(onAction).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return <button onClick={() => toast('Grupo creado')}>Avisar</button>;
  }

  it('should announce a message and hide it after a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Avisar' }));
    expect(screen.getByRole('status')).toHaveTextContent('Grupo creado');

    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText('Grupo creado')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { Alert } from './Alert';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { TextField } from './TextField';

describe('Button', () => {
  it('should be disabled and announce progress when busy', () => {
    render(
      <Button busy busyLabel="Entrando…">
        Entrar
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Entrando…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('TextField', () => {
  it('should associate the label, the help text and the error with the input', () => {
    render(<TextField label="Email" help="Tu email del club" error="Escribe tu email" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAccessibleDescription('Tu email del club Escribe tu email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Alert', () => {
  it('should be announced to assistive technology', () => {
    render(<Alert>Email o contraseña incorrectos.</Alert>);

    expect(screen.getByRole('alert')).toHaveTextContent('Email o contraseña incorrectos.');
  });
});

function DialogHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="titulo">
        <h2 id="titulo">Acceso administración</h2>
        <input aria-label="Primero" />
        <button>Último</button>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('should focus inside, trap tab and return focus to the opener when closed with escape', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Abrir' });

    await user.click(opener);

    expect(screen.getByRole('dialog', { name: 'Acceso administración' })).toBeVisible();
    expect(screen.getByLabelText('Primero')).toHaveFocus();
    await user.tab();
    await user.tab();
    expect(screen.getByLabelText('Primero')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('should close when clicking the backdrop but not the content', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    await user.click(screen.getByRole('heading', { name: 'Acceso administración' }));
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.click(screen.getByTestId('dialog-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

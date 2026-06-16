import { useState } from 'react';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function HeaderCalculator() {
  const [display, setDisplay] = useState('0');
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const inputNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? num : display + num);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
    } else if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clear = () => {
    setDisplay('0');
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  };

  const backspace = () => {
    if (display.length === 1 || (display.length === 2 && display.startsWith('-'))) {
      setDisplay('0');
    } else {
      setDisplay(display.slice(0, -1));
    }
  };

  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(display);

    if (previousValue === null) {
      setPreviousValue(inputValue);
    } else if (operator) {
      const result = calculate(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(result);
    }

    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (prev: number, current: number, op: string): number => {
    switch (op) {
      case '+':
        return prev + current;
      case '-':
        return prev - current;
      case '×':
        return prev * current;
      case '÷':
        return current !== 0 ? prev / current : 0;
      case '%':
        return prev * (current / 100);
      default:
        return current;
    }
  };

  const performEquals = () => {
    if (operator && previousValue !== null) {
      const inputValue = parseFloat(display);
      const result = calculate(previousValue, inputValue, operator);
      setDisplay(String(result));
      setPreviousValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  const percentage = () => {
    const value = parseFloat(display);
    setDisplay(String(value / 100));
  };

  const formatDisplay = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return '0';
    if (value.endsWith('.')) return value;
    if (value.includes('.') && value.endsWith('0')) return value;
    if (Math.abs(num) >= 1e10) return num.toExponential(4);
    return value;
  };

  const CalcButton = ({ 
    children, 
    onClick, 
    variant = 'default',
    className = ''
  }: { 
    children: React.ReactNode; 
    onClick: () => void; 
    variant?: 'default' | 'operator' | 'function' | 'equals';
    className?: string;
  }) => {
    const baseClasses = 'h-10 font-medium text-base transition-colors';
    const variantClasses = {
      default: 'bg-muted hover:bg-muted/80 text-foreground',
      operator: 'bg-primary/20 hover:bg-primary/30 text-primary',
      function: 'bg-destructive/20 hover:bg-destructive/30 text-destructive',
      equals: 'bg-primary hover:bg-primary/90 text-primary-foreground',
    };

    return (
      <Button
        variant="ghost"
        className={`${baseClasses} ${variantClasses[variant]} ${className}`}
        onClick={onClick}
      >
        {children}
      </Button>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
        >
          <Calculator className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-3">
        {/* Display */}
        <div className="bg-muted rounded-lg p-3 mb-3 text-right">
          <div className="text-xs text-muted-foreground h-4">
            {previousValue !== null && operator && `${previousValue} ${operator}`}
          </div>
          <div className="text-2xl font-mono text-foreground truncate">
            {formatDisplay(display)}
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-1.5">
          {/* Row 1 */}
          <CalcButton onClick={clear} variant="function">C</CalcButton>
          <CalcButton onClick={backspace} variant="function">←</CalcButton>
          <CalcButton onClick={percentage} variant="operator">%</CalcButton>
          <CalcButton onClick={() => performOperation('÷')} variant="operator">÷</CalcButton>

          {/* Row 2 */}
          <CalcButton onClick={() => inputNumber('7')}>7</CalcButton>
          <CalcButton onClick={() => inputNumber('8')}>8</CalcButton>
          <CalcButton onClick={() => inputNumber('9')}>9</CalcButton>
          <CalcButton onClick={() => performOperation('×')} variant="operator">×</CalcButton>

          {/* Row 3 */}
          <CalcButton onClick={() => inputNumber('4')}>4</CalcButton>
          <CalcButton onClick={() => inputNumber('5')}>5</CalcButton>
          <CalcButton onClick={() => inputNumber('6')}>6</CalcButton>
          <CalcButton onClick={() => performOperation('-')} variant="operator">−</CalcButton>

          {/* Row 4 */}
          <CalcButton onClick={() => inputNumber('1')}>1</CalcButton>
          <CalcButton onClick={() => inputNumber('2')}>2</CalcButton>
          <CalcButton onClick={() => inputNumber('3')}>3</CalcButton>
          <CalcButton onClick={() => performOperation('+')} variant="operator">+</CalcButton>

          {/* Row 5 */}
          <CalcButton onClick={() => inputNumber('0')} className="col-span-2">0</CalcButton>
          <CalcButton onClick={inputDecimal}>,</CalcButton>
          <CalcButton onClick={performEquals} variant="equals">=</CalcButton>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

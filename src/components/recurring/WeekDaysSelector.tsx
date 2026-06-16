import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface WeekDaysSelectorProps {
  timesPerWeek: number;
  selectedDays: string[];
  onTimesChange: (times: number) => void;
  onDaysChange: (days: string[]) => void;
}

const DAYS = [
  { value: 'monday', label: 'Seg' },
  { value: 'tuesday', label: 'Ter' },
  { value: 'wednesday', label: 'Qua' },
  { value: 'thursday', label: 'Qui' },
  { value: 'friday', label: 'Sex' },
  { value: 'saturday', label: 'Sáb' },
  { value: 'sunday', label: 'Dom' },
];

export function WeekDaysSelector({
  timesPerWeek,
  selectedDays,
  onTimesChange,
  onDaysChange,
}: WeekDaysSelectorProps) {
  const handleDayToggle = (day: string) => {
    if (selectedDays.includes(day)) {
      onDaysChange(selectedDays.filter(d => d !== day));
    } else if (selectedDays.length < timesPerWeek) {
      onDaysChange([...selectedDays, day]);
    }
  };

  const remainingDays = timesPerWeek - selectedDays.length;

  return (
    <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
      <div>
        <Label>Quantas vezes por semana?</Label>
        <Select
          value={timesPerWeek.toString()}
          onValueChange={(value) => {
            const newTimes = parseInt(value);
            onTimesChange(newTimes);
            // Trim selected days if they exceed the new limit
            if (selectedDays.length > newTimes) {
              onDaysChange(selectedDays.slice(0, newTimes));
            }
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5, 6, 7].map((num) => (
              <SelectItem key={num} value={num.toString()}>
                {num} {num === 1 ? 'vez' : 'vezes'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Quais dias?</Label>
        <div className="flex gap-1 mt-2 flex-wrap">
          {DAYS.map((day) => {
            const isSelected = selectedDays.includes(day.value);
            const isDisabled = !isSelected && selectedDays.length >= timesPerWeek;
            
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => handleDayToggle(day.value)}
                disabled={isDisabled}
                className={cn(
                  'px-3 py-1.5 text-sm rounded-md border transition-colors',
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted',
                  isDisabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        {remainingDays > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Selecione {remainingDays} {remainingDays === 1 ? 'dia' : 'dias'}
          </p>
        )}
      </div>
    </div>
  );
}

export const DAY_LABELS: Record<string, string> = {
  monday: 'Seg',
  tuesday: 'Ter',
  wednesday: 'Qua',
  thursday: 'Qui',
  friday: 'Sex',
  saturday: 'Sáb',
  sunday: 'Dom',
};

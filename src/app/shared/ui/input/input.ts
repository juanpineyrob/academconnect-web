import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let uid = 0;

const noop = (): void => undefined;

@Component({
  selector: 'ac-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [class]="wrapperClasses()">
      <input
        [id]="inputId()"
        [type]="type()"
        [value]="value()"
        [disabled]="disabled()"
        [attr.autocomplete]="autocomplete()"
        [attr.placeholder]="' '"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="errorMessage() ? errorId() : null"
        (input)="onInput($event)"
        (blur)="onBlur()"
        class="ac-input__field" />
      <span class="ac-input__label">{{ label() }}</span>
    </label>
    @if (errorMessage()) {
      <p [id]="errorId()" class="ac-input__error" role="alert">{{ errorMessage() }}</p>
    }
  `,
  styleUrl: './input.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => Input),
      multi: true,
    },
  ],
})
export class Input implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'email' | 'password' | 'number'>('text');
  readonly autocomplete = input<string | null>(null);
  readonly invalid = input<boolean>(false);
  readonly errorMessage = input<string | null>(null);

  protected readonly value = signal<string>('');
  protected readonly disabled = signal<boolean>(false);
  protected readonly focused = signal<boolean>(false);

  protected readonly inputId = signal<string>(`ac-input-${++uid}`);
  protected readonly errorId = computed(() => `${this.inputId()}-err`);

  protected readonly wrapperClasses = computed(() => {
    const cls = ['ac-input'];
    if (this.invalid()) cls.push('ac-input--invalid');
    if (this.disabled()) cls.push('ac-input--disabled');
    return cls.join(' ');
  });

  private onChange: (v: string) => void = noop;
  private onTouched: () => void = noop;

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  protected onInput(event: Event): void {
    const next = (event.target as HTMLInputElement).value;
    this.value.set(next);
    this.onChange(next);
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.onTouched();
  }
}

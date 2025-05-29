import { NumberInput, Slider } from '@mantine/core';
import classes from './SliderInput.module.css';

export type StyleInputProps = {
  maxValue: number;
  value: number;
  label: string;
  onChange: (value: number | string) => void;
};

export function SliderInput(props: StyleInputProps) {
  const step = 1;
  const minValue = 0;
  return (
    <div className={classes.wrapper}>
      <NumberInput
        value={props.value}
        onChange={props.onChange}
        label={props.label}
        placeholder=""
        step={step}
        min={minValue}
        max={props.maxValue}
        hideControls
        classNames={{ input: classes.input, label: classes.label }}
      />
      <Slider
        max={props.maxValue}
        step={step}
        min={minValue}
        label={null}
        value={props.value}
        onChange={props.onChange}
        size={2}
        className={classes.slider}
        classNames={classes}
      />
    </div>
  );
}

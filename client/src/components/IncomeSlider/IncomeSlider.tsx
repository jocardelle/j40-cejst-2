import React, {useState, useEffect} from 'react';
import {RangeSlider, Label, Grid} from '@trussworks/react-uswds';
import * as styles from './IncomeSlider.module.scss';

interface IncomeSliderProps {
  onChange: (min: number, max: number) => void;
  minIncome?: number;
  maxIncome?: number;
  defaultMin?: number;
  defaultMax?: number;
}

const IncomeSlider: React.FC<IncomeSliderProps> = ({
  onChange,
  minIncome = 0,
  maxIncome = 100,
  defaultMin = 0,
  defaultMax = 100,
}) => {
  const [rangeValue, setRangeValue] = useState<[number, number]>([
    defaultMin,
    defaultMax,
  ]);

  useEffect(() => {
    onChange(rangeValue[0], rangeValue[1]);
  }, [rangeValue, onChange]);

  const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [min, max] = e.target.value.split(',').map(Number);
    setRangeValue([min, max]);
  };

  return (
    <div className={styles.incomeSliderContainer}>
      <Grid row>
        <Grid desktop={{col: 12}} tablet={{col: 12}} col={12}>
          <Label htmlFor="income-slider">Income Percentile Filter</Label>
          <div className={styles.sliderValues}>
            <span>{rangeValue[0]}%</span>
            <span>{rangeValue[1]}%</span>
          </div>
        </Grid>
      </Grid>
      <Grid row>
        <Grid desktop={{col: 12}} tablet={{col: 12}} col={12}>
          <RangeSlider
            id="income-slider"
            min={minIncome}
            max={maxIncome}
            step={1}
            value={`${rangeValue[0]},${rangeValue[1]}`}
            onChange={handleRangeChange}
          />
        </Grid>
      </Grid>
    </div>
  );
};

export default IncomeSlider;

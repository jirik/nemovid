import { Checkbox } from '@mantine/core';
import { type ChangeEvent, useCallback } from 'react';
import { parcelCodeListFiltersChanged } from './actions.ts';
import type { CodeList, CodeListItem } from './cuzk.ts';

export type CodeListFilterProps = {
  list: CodeList;
  filter: { [code: string]: boolean } | null;
  // onChange: (values: {[code: string]: boolean}) => void;
};

export type ItemProps = {
  checked: boolean;
  item: CodeListItem;
  // onChange: (values: {[code: string]: boolean}) => void;
};

const Item = (props: ItemProps) => {
  // console.log('props', props);
  const code = props.item.code;
  const callback = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      console.log('code', code, 'checked', event.currentTarget.checked);
      parcelCodeListFiltersChanged({
        landUse: { [props.item.code]: event.currentTarget.checked },
      });
    },
    [code],
  );
  return (
    <Checkbox
      checked={props.checked}
      onChange={callback}
      tabIndex={-1}
      label={props.item.label}
    />
  );
};

export function CodeListFilter(props: CodeListFilterProps) {
  const { list, filter } = props;
  return (
    <div>
      <h4>{list.label}</h4>
      <div>
        {Object.values(list.values).map((item) => {
          return (
            <Item
              key={item.code}
              checked={filter == null || !!filter[item.code]}
              item={item}
            />
          );
        })}
      </div>
    </div>
  );
}

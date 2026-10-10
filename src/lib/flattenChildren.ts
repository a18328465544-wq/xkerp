import {Children, Fragment, cloneElement, isValidElement, type ReactNode} from "react";

/** Children.toArray keeps a Fragment as one child. Regions that count or
 * slice their items (metrics grids) need the Fragment's own children instead,
 * so `<>{cards}</>` and an inline list lay out the same way. */
export function flattenChildren(children: ReactNode, keyPrefix = ""): ReactNode[] {
  return Children.toArray(children).flatMap((child) => {
    if (isValidElement<{children?: ReactNode}>(child) && child.type === Fragment) {
      return flattenChildren(child.props.children, `${keyPrefix}${String(child.key ?? "")}/`);
    }
    return keyPrefix && isValidElement(child) ? [cloneElement(child, {key: `${keyPrefix}${String(child.key ?? "")}`})] : [child];
  });
}

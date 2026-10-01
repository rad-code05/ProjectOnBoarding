"use client";

import { useState } from "react";
import { IconButton } from "./IconButton";
import { EyeIcon, EyeOffIcon } from "./icons";
import { TextField, type TextFieldProps } from "./TextField";

export type PasswordFieldProps = Omit<TextFieldProps, "type" | "endAdornment">;

/** Password input with a show/hide toggle. */
export function PasswordField({
  autoComplete = "current-password",
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      endAdornment={
        <IconButton
          variant="ghost"
          size="sm"
          label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          icon={visible ? <EyeOffIcon /> : <EyeIcon />}
          onClick={() => setVisible((v) => !v)}
        />
      }
    />
  );
}

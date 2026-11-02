import { message } from "antd";
import type { FormInstance } from "antd";

interface ReportFormErrorOptions {
  form?: FormInstance;
  fallback?: string;
}

/**
 * RULES §47: Failed Saves — Say WHICH Field, Never "Could Not Save"
 * Routes validation or server errors cleanly with field-specific context and auto-scrolling.
 */
export function reportFormError(
  error: any,
  { form, fallback = "Could not complete operation. Please try again." }: ReportFormErrorOptions = {}
): string {
  // 1. Ant Design Form Validation Error ({ errorFields: [{ name, errors }] })
  if (error && error.errorFields && Array.isArray(error.errorFields)) {
    const errorFields = error.errorFields;
    if (errorFields.length > 0) {
      const firstField = errorFields[0];
      const firstErrorMessage = firstField.errors?.[0] || "Please check this required field.";
      const otherCount = errorFields.length - 1;

      const toastMessage =
        otherCount > 0
          ? `${firstErrorMessage} (${otherCount} other field${otherCount > 1 ? "s" : ""} need attention)`
          : firstErrorMessage;

      message.error(toastMessage);

      // Scroll to the first invalid field
      if (form && typeof form.scrollToField === "function" && firstField.name) {
        try {
          form.scrollToField(firstField.name, { behavior: "auto" });
        } catch (_) {}
      }

      return toastMessage;
    }
  }

  // 2. Axios / Server-rejected response error (response.data.error)
  const serverMessage =
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    (typeof error === "string" ? error : null);

  const displayMessage = serverMessage || fallback;
  message.error(displayMessage);
  return displayMessage;
}

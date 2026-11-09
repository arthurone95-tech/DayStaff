import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fontSize, radius, shadow, spacing } from '../theme';
import { AppButton } from './AppButton';

export type DialogTone = 'info' | 'success' | 'warning' | 'danger' | 'question';
export type DialogActionTone = 'default' | 'destructive' | 'cancel';
export type DialogIcon = ComponentProps<typeof Ionicons>['name'];

export interface DialogAction {
  label: string;
  tone?: DialogActionTone;
  icon?: DialogIcon;
  onPress?: () => void | Promise<void>;
}

export interface AlertDialogOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  icon?: DialogIcon;
  buttonLabel?: string;
  onClose?: () => void;
}

export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  icon?: DialogIcon;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface ActionSheetOptions {
  title: string;
  message?: string;
  tone?: DialogTone;
  icon?: DialogIcon;
  actions: DialogAction[];
}

interface AppDialogContextValue {
  /** A centred, themed message dialog with a single button. */
  alert: (options: AlertDialogOptions) => void;
  /** A bottom sheet with a confirm action and a cancel action. */
  confirm: (options: ConfirmDialogOptions) => void;
  /** A bottom sheet with a custom list of actions. */
  actions: (options: ActionSheetOptions) => void;
  dismiss: () => void;
}

type AlertState = { kind: 'alert' } & AlertDialogOptions;
type SheetState = {
  kind: 'sheet';
  title: string;
  message?: string;
  tone?: DialogTone;
  icon?: DialogIcon;
  actions: DialogAction[];
};
type DialogState = AlertState | SheetState;

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

const TONE_META: Record<
  DialogTone,
  {
    icon: DialogIcon;
    color: string;
    background: string;
    button: 'primary' | 'success' | 'danger';
  }
> = {
  info: {
    icon: 'information-circle',
    color: colors.info,
    background: colors.infoSoft,
    button: 'primary',
  },
  success: {
    icon: 'checkmark-circle',
    color: colors.success,
    background: colors.successSoft,
    button: 'success',
  },
  warning: {
    icon: 'alert-circle',
    color: colors.warning,
    background: colors.warningSoft,
    button: 'primary',
  },
  danger: {
    icon: 'close-circle',
    color: colors.danger,
    background: colors.dangerSoft,
    button: 'danger',
  },
  question: {
    icon: 'help-circle',
    color: colors.primary,
    background: colors.infoSoft,
    button: 'primary',
  },
};

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const showSheet = useCallback(
    (next: SheetState) => {
      sheetAnim.setValue(0);
      setDialog(next);
    },
    [sheetAnim],
  );

  const dismiss = useCallback(() => {
    if (dialog?.kind === 'sheet') {
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => setDialog(null));
      return;
    }
    setDialog(null);
  }, [dialog, sheetAnim]);

  const alert = useCallback((options: AlertDialogOptions) => {
    setDialog({ kind: 'alert', ...options });
  }, []);

  const confirm = useCallback(
    (options: ConfirmDialogOptions) => {
      showSheet({
        kind: 'sheet',
        title: options.title,
        message: options.message,
        tone:
          options.tone ?? (options.destructive ? 'danger' : 'question'),
        icon: options.icon,
        actions: [
          {
            label: options.confirmLabel,
            tone: options.destructive ? 'destructive' : 'default',
            onPress: options.onConfirm,
          },
          {
            label: options.cancelLabel ?? 'Cancel',
            tone: 'cancel',
            onPress: options.onCancel,
          },
        ],
      });
    },
    [showSheet],
  );

  const actions = useCallback(
    (options: ActionSheetOptions) => {
      showSheet({ kind: 'sheet', ...options });
    },
    [showSheet],
  );

  useEffect(() => {
    if (dialog?.kind !== 'sheet') {
      return;
    }
    Animated.timing(sheetAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [dialog, sheetAnim]);

  const contextValue = useMemo(
    () => ({ alert, confirm, actions, dismiss }),
    [alert, confirm, actions, dismiss],
  );

  const closeSheetThen = (action?: DialogAction) => {
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setDialog(null);
      if (action?.onPress) {
        void Promise.resolve().then(action.onPress);
      }
    });
  };

  const alertTone = dialog?.kind === 'alert' ? dialog.tone ?? 'info' : 'info';
  const alertMeta = TONE_META[alertTone];
  const alertIcon =
    dialog?.kind === 'alert' ? dialog.icon ?? alertMeta.icon : alertMeta.icon;

  const sheetTone =
    dialog?.kind === 'sheet' ? dialog.tone ?? 'question' : 'question';
  const sheetMeta = TONE_META[sheetTone];
  const sheetIcon =
    dialog?.kind === 'sheet' ? dialog.icon ?? sheetMeta.icon : sheetMeta.icon;

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [80, 0],
  });

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={dialog?.kind === 'alert'}
        transparent
        animationType="fade"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={dismiss}
      >
        <View style={styles.alertOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            accessibilityLabel="Dismiss dialog"
          />
          <View style={styles.alertCard} accessibilityViewIsModal>
            <View
              style={[
                styles.alertIcon,
                { backgroundColor: alertMeta.background },
              ]}
            >
              <Ionicons name={alertIcon} size={32} color={alertMeta.color} />
            </View>
            <Text style={styles.alertTitle}>
              {dialog?.kind === 'alert' ? dialog.title : ''}
            </Text>
            {dialog?.kind === 'alert' && dialog.message ? (
              <Text style={styles.alertMessage}>{dialog.message}</Text>
            ) : null}
            <AppButton
              title={
                dialog?.kind === 'alert' ? dialog.buttonLabel ?? 'OK' : 'OK'
              }
              onPress={() => {
                const onClose =
                  dialog?.kind === 'alert' ? dialog.onClose : undefined;
                setDialog(null);
                onClose?.();
              }}
              variant={alertMeta.button}
              size="lg"
              style={styles.alertButton}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={dialog?.kind === 'sheet'}
        transparent
        animationType="none"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={dismiss}
      >
        <View style={styles.sheetOverlay}>
          <Animated.View
            style={[styles.sheetBackdrop, { opacity: sheetAnim }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={dismiss}
              accessibilityLabel="Dismiss dialog"
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              {
                paddingBottom: Math.max(insets.bottom, spacing.lg),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
            accessibilityViewIsModal
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View
                style={[
                  styles.sheetIcon,
                  { backgroundColor: sheetMeta.background },
                ]}
              >
                <Ionicons
                  name={sheetIcon}
                  size={24}
                  color={sheetMeta.color}
                />
              </View>
              <Text style={styles.sheetTitle}>
                {dialog?.kind === 'sheet' ? dialog.title : ''}
              </Text>
            </View>
            {dialog?.kind === 'sheet' && dialog.message ? (
              <Text style={styles.sheetMessage}>{dialog.message}</Text>
            ) : null}
            <View style={styles.sheetActions}>
              {dialog?.kind === 'sheet'
                ? dialog.actions.map((action, index) => {
                    const destructive = action.tone === 'destructive';
                    const cancel = action.tone === 'cancel';
                    return (
                      <Pressable
                        key={`${action.label}-${index}`}
                        accessibilityRole="button"
                        onPress={() => closeSheetThen(action)}
                        style={({ pressed }) => [
                          styles.sheetAction,
                          !cancel && styles.sheetActionPrimary,
                          destructive && styles.sheetActionDestructive,
                          cancel && styles.sheetActionCancel,
                          pressed && styles.sheetActionPressed,
                        ]}
                      >
                        {action.icon ? (
                          <Ionicons
                            name={action.icon}
                            size={19}
                            color={cancel ? colors.slate500 : colors.white}
                            style={styles.sheetActionIcon}
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.sheetActionLabel,
                            cancel && styles.sheetActionLabelCancel,
                          ]}
                        >
                          {action.label}
                        </Text>
                      </Pressable>
                    );
                  })
                : null}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </AppDialogContext.Provider>
  );
}

export function useAppDialog(): AppDialogContextValue {
  const context = useContext(AppDialogContext);
  if (!context) {
    throw new Error('useAppDialog must be used inside AppDialogProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  alertOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  alertCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.modal,
  },
  alertIcon: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  alertTitle: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.slate900,
    textAlign: 'center',
  },
  alertMessage: {
    marginTop: spacing.sm,
    fontSize: fontSize.md,
    lineHeight: 22,
    color: colors.slate500,
    textAlign: 'center',
    alignSelf: 'stretch',
    flexShrink: 1,
  },
  alertButton: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    ...shadow.modal,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate300,
    marginBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.slate900,
  },
  sheetMessage: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    lineHeight: 20,
    color: colors.slate500,
    alignSelf: 'stretch',
    flexShrink: 1,
  },
  sheetActions: {
    marginTop: spacing.lg,
  },
  sheetAction: {
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sheetActionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sheetActionDestructive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  sheetActionCancel: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  sheetActionPressed: {
    opacity: 0.7,
  },
  sheetActionIcon: {
    marginRight: spacing.sm,
  },
  sheetActionLabel: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.white,
  },
  sheetActionLabelCancel: {
    color: colors.slate500,
    fontWeight: '600',
  },
});

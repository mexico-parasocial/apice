export type { AppTheme } from "./theme";
export { baseTheme } from "./theme";
export type { LessonNode, CourseProgressResponse, ProgressDeps, QuizQuestion, QuizResponse, QuizSubmitResponse } from "./hooks/useCourseProgress";
export { makeCourseProgressHooks } from "./hooks/useCourseProgress";

export type {
  VideoDeliveryDeps,
  PlaybackUrlResponse,
  ReportProgressInput,
  ReportProgressResponse,
  MarkCompleteResponse,
} from "./hooks/useVideoDelivery";
export { makeVideoDeliveryHooks } from "./hooks/useVideoDelivery";

export type {
  CourseSummary,
  CourseDetail,
  CourseLesson,
  CourseContent,
  CoursesDeps,
} from "./hooks/useCourses";
export { makeCoursesHooks } from "./hooks/useCourses";

export type {
  IM8AuthDeps,
  IM8StartInput,
  IM8StartResponse,
  IM8CompleteInput,
  IM8CompleteResponse,
  IM8Session,
} from "./hooks/useIM8Auth";
export { makeIM8AuthHooks } from "./hooks/useIM8Auth";

export type {
  PasswordAuthDeps,
  PasswordLoginInput,
  PasswordLoginResponse,
} from "./hooks/usePasswordAuth";
export { makePasswordAuthHooks } from "./hooks/usePasswordAuth";

export { downloadCertificate } from "./utils/certificateDownload";
export type { DownloadCertificateOptions } from "./utils/certificateDownload";

export type {
  AtprotoAuthDeps,
  AtprotoLoginResult,
} from "./hooks/useAtprotoAuth";
export { makeAtprotoAuthHooks, ATPROTO_DEEPLINK } from "./hooks/useAtprotoAuth";



export type {
  Certificate,
  CertificatesDeps,
  ClaimCertificateResponse,
} from "./hooks/useCertificates";
export { makeCertificateHooks } from "./hooks/useCertificates";
export { default as LessonRoad } from "./components/LessonRoad";
export { VideoPlayer, VideoPlayerSkeleton } from "./components/VideoPlayer";
export {
  VideoVolumeProvider,
  useVideoMuteState,
} from "./components/video/VideoVolumeContext";
export { AltBadgeWithDialog } from "./components/video/AltBadgeWithDialog";
export { LoadingState, ErrorState, EmptyState } from "./components/states";

export type { EnrollmentDeps } from "./hooks/useEnrollment";
export { makeEnrollmentHooks } from "./hooks/useEnrollment";

export { ThemeProvider, useTheme, atoms, tokens } from "./alf";
export {
  isIOS,
  isAndroid,
  isNative,
  isWeb,
  platform,
  native,
  web,
  ios,
  android,
} from "./platform";
export { Text as AlfText } from "./alf/typography";
export type { VideoPlayerProps } from "./components/VideoPlayer";

export {
  InteractiveOnboarding,
  OnboardingContext,
  OnboardingThemeContext,
  OnboardingThemeProvider,
  OnboardingCallbacksContext,
  OnboardingCallbacksProvider,
  createInitialOnboardingState,
  reducer,
  useInteractiveOnboarding,
  useOnboardingTheme,
  useOnboardingCallbacks,
} from "./onboarding";

export type {
  InteractiveOnboardingProps,
  OnboardingAction,
  OnboardingProfile,
  OnboardingState,
  OnboardingStep,
  OnboardingThemeApi,
  OnboardingThemeMode,
  OnboardingTokens,
} from "./onboarding";

export {
  buttonStyle,
  buttonStyles,
  buttonTextStyle,
  cardStyle,
  cardStyles,
  rowStyle,
  rowStyles,
  pillStyle,
  pillStyles,
  pillTextStyle,
  SegmentedControl,
  UserAvatar,
  Icon,
  StatusBanner,
  tokens as m8Tokens,
  colors as m8Colors,
  palette as m8Palette,
  iosShadow as m8IosShadow,
} from "./components/m8";

export type {
  ButtonVariant,
  CardVariant,
  RowVariant,
  PillVariant,
  IconName,
} from "./components/m8";

export {
  OptativeCourseCard,
  OptativeModuleCard,
  OptativeCarousel,
  OptativeHomeSection,
} from "./components/Optatives";

export type {
  OptativeCourseCardProps,
  OptativeModuleCardProps,
  OptativeCarouselProps,
  OptativeHomeSectionProps,
} from "./components/Optatives";

export {
  CompletionModal,
  CertificateList,
} from "./components/Certificates";

export type {
  CompletionModalProps,
  CertificateListProps,
} from "./components/Certificates";

export { useBreakpoint, BREAKPOINTS, CONTENT_MAX_WIDTH } from "./hooks/useBreakpoint";
export type { Breakpoint } from "./hooks/useBreakpoint";
export { ContentContainer } from "./components/ContentContainer";
export type { ContentContainerProps } from "./components/ContentContainer";

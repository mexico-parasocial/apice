import { View, Text, StyleSheet } from "react-native";
import { useState } from "react";
import { useOnboardingTheme } from "../theme-context";
import { useInteractiveOnboarding } from "../state";
import { useOnboardingCallbacks } from "../callbacks-context";
import HighlightedTitle from "../components/HighlightedTitle";
import TextField from "../components/TextField";
import Select from "../components/Select";
import ContinueButton from "../components/ContinueButton";

const genderOptions = [
  { label: "Mujer", value: "mujer" },
  { label: "Hombre", value: "hombre" },
  { label: "No binario", value: "no-binario" },
  { label: "Prefiero no decir", value: "prefiero-no-decir" },
];

const stateOptions = [
  { label: "Aguascalientes", value: "aguascalientes" },
  { label: "Baja California", value: "baja-california" },
  { label: "Baja California Sur", value: "baja-california-sur" },
  { label: "Campeche", value: "campeche" },
  { label: "Chiapas", value: "chiapas" },
  { label: "Chihuahua", value: "chihuahua" },
  { label: "Ciudad de México", value: "cdmx" },
  { label: "Coahuila", value: "coahuila" },
  { label: "Colima", value: "colima" },
  { label: "Durango", value: "durango" },
  { label: "Estado de México", value: "estado-de-mexico" },
  { label: "Guanajuato", value: "guanajuato" },
  { label: "Guerrero", value: "guerrero" },
  { label: "Hidalgo", value: "hidalgo" },
  { label: "Jalisco", value: "jalisco" },
  { label: "Michoacán", value: "michoacan" },
  { label: "Morelos", value: "morelos" },
  { label: "Nayarit", value: "nayarit" },
  { label: "Nuevo León", value: "nuevo-leon" },
  { label: "Oaxaca", value: "oaxaca" },
  { label: "Puebla", value: "puebla" },
  { label: "Querétaro", value: "queretaro" },
  { label: "Quintana Roo", value: "quintana-roo" },
  { label: "San Luis Potosí", value: "san-luis-potosi" },
  { label: "Sinaloa", value: "sinaloa" },
  { label: "Sonora", value: "sonora" },
  { label: "Tabasco", value: "tabasco" },
  { label: "Tamaulipas", value: "tamaulipas" },
  { label: "Tlaxcala", value: "tlaxcala" },
  { label: "Veracruz", value: "veracruz" },
  { label: "Yucatán", value: "yucatan" },
  { label: "Zacatecas", value: "zacatecas" },
];

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export default function StepBasicData() {
  const { tokens } = useOnboardingTheme();
  const { state, dispatch } = useInteractiveOnboarding();
  const { onComplete } = useOnboardingCallbacks();
  const [profile, setProfile] = useState(state.data.profile);
  const [errors, setErrors] = useState<
    Partial<Record<keyof typeof profile, string>>
  >({});

  const updateField = (field: keyof typeof profile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof typeof profile, string>> = {};
    if (!profile.fullName.trim()) {
      nextErrors.fullName = "El nombre completo es obligatorio";
    }
    if (!profile.email.trim()) {
      nextErrors.email = "El correo electrónico es obligatorio";
    } else if (!isValidEmail(profile.email)) {
      nextErrors.email = "Ingresa un correo válido";
    }
    if (!profile.birthDate.trim()) {
      nextErrors.birthDate = "La fecha de nacimiento es obligatoria";
    }
    if (!profile.gender) {
      nextErrors.gender = "Selecciona tu género";
    }
    if (!profile.state) {
      nextErrors.state = "Selecciona tu estado";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;

    const finalProfile = { ...state.data, profile };
    dispatch({ type: "setData", data: { profile } });
    await onComplete(finalProfile);
  };

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 12,
    },
    flex: {
      flex: 1,
    },
    helper: {
      fontSize: 13,
      color: tokens.muted,
      marginTop: -8,
      marginBottom: 16,
      marginLeft: 8,
    },
  });

  return (
    <View>
      <HighlightedTitle highlights={["transparente", "básicos"]}>
        Para mantener un registro transparente, necesitamos estos datos básicos.
      </HighlightedTitle>

      <TextField
        placeholder="Nombre completo"
        value={profile.fullName}
        onChangeText={(value) => updateField("fullName", value)}
        autoCapitalize="words"
        error={errors.fullName}
      />

      <TextField
        placeholder="Correo electrónico"
        value={profile.email}
        onChangeText={(value) => updateField("email", value)}
        keyboardType="email-address"
        error={errors.email}
      />

      <TextField
        placeholder="dd/mm/aaaa"
        value={profile.birthDate}
        onChangeText={(value) => updateField("birthDate", value)}
        error={errors.birthDate}
      />
      <Text style={styles.helper}>Formato: dd/mm/aaaa</Text>

      <View style={styles.row}>
        <View style={styles.flex}>
          <Select
            placeholder="Género"
            value={profile.gender}
            options={genderOptions}
            onChange={(value) => updateField("gender", value ?? "")}
          />
          {errors.gender && (
            <Text style={[styles.helper, { color: tokens.danger }]}>
              {errors.gender}
            </Text>
          )}
        </View>
        <View style={styles.flex}>
          <Select
            placeholder="Estado"
            value={profile.state}
            options={stateOptions}
            onChange={(value) => updateField("state", value ?? "")}
          />
          {errors.state && (
            <Text style={[styles.helper, { color: tokens.danger }]}>
              {errors.state}
            </Text>
          )}
        </View>
      </View>

      <ContinueButton title="Continuar" onPress={handleContinue} />
    </View>
  );
}

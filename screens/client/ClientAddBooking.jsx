import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  Alert,
} from "react-native";

import styles from "../../styles/css/client/clientAddBookingStyles";
import { useMobileData } from "../../context/MobileDataContext.jsx";
import {
  buildPreferredDetailerPayload,
  getPreferredDetailerOptions,
  getServiceArrivalTimeOptions,
  PLACE_SLOT_OPTIONS,
} from "../../services/bookingWorkflow";
import { CAR_SIZE_OPTIONS, getPriceForCarSize } from "../../services/servicePricing";

const pad2 = (n) => String(n).padStart(2, "0");
const toKey = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function addMonths(date, delta) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + delta);
  return d;
}

function monthLabel(d) {
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function selectedDateLabel(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return toKey(a) === toKey(b);
}

function normalizeSavedCar(car = {}) {
  return {
    ...car,
    vehicle: String(car.vehicle || car.vehicleModel || car.model || car.name || "").trim(),
    plate: String(car.plate || car.plateNumber || car.registrationNumber || "").trim().toUpperCase(),
    size: String(car.size || car.carSize || car.category || "").trim(),
  };
}

function getSavedCarId(car = {}) {
  return String(car.id || car._id || car.vehicleId || car.carId || "").trim();
}

function getSavedCarLabel(car = {}) {
  return `${car.vehicle} | ${String(car.plate || "").toUpperCase()}`;
}

function createEmptyForm(defaultService = "") {
  return {
    selectedCar: "",
    vehicle: "",
    plate: "",
    carSize: "",
    service: defaultService,
    time: "",
    notes: "",
    preferredDetailerId: "",
  };
}

function isMotorCoatingService(service) {
  const name = String(
    typeof service === "string"
      ? service
      : service?.name || service?.title || service?.serviceName || ""
  )
    .trim()
    .toLowerCase();
  return name.includes("motor coating") || name.includes("motorcoating");
}

function SelectModal({ visible, title, options, value, onPick, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>

          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {options.map((option) => {
              const opt = typeof option === "string"
                ? { value: option, label: option }
                : option;
              const active = String(opt.value) === String(value);
              return (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.9}
                  style={[styles.modalItem, active && styles.modalItemActive]}
                  onPress={() => {
                    onPick?.(opt.value);
                    onClose?.();
                  }}
                >
                  <Text style={[styles.modalItemTxt, active && styles.modalItemTxtActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity activeOpacity={0.9} style={styles.modalCloseBtn} onPress={onClose}>
            <Text style={styles.modalCloseTxt}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function ClientAddBooking({ onBack, onConfirm }) {
  const { services, bookings, users, currentUser, createBooking } = useMobileData();
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toKey(today), [today]);

  const bookableServices = useMemo(
    () => services.filter((item) => item?.name && item.enabled !== false),
    [services]
  );
  const serviceOptions = useMemo(
    () => bookableServices.map((item) => item.name),
    [bookableServices]
  );
  const savedCars = useMemo(
    () =>
      (Array.isArray(currentUser?.cars) ? currentUser.cars : Array.isArray(currentUser?.vehicles) ? currentUser.vehicles : [])
        .map(normalizeSavedCar)
        .filter(
        (car) => car?.vehicle && car?.plate
      ),
    [currentUser]
  );
  const carOptions = useMemo(
    () =>
      savedCars
        .map((car) => ({ value: getSavedCarId(car), label: getSavedCarLabel(car) }))
        .filter((car) => car.value),
    [savedCars]
  );
  const preferredDetailers = useMemo(() => getPreferredDetailerOptions(users), [users]);
  const preferredDetailerOptions = useMemo(
    () => [
      { value: "", label: "No preference" },
      ...preferredDetailers.map((detailer) => ({ value: detailer.id, label: detailer.label })),
    ],
    [preferredDetailers]
  );

  const [form, setForm] = useState(() => createEmptyForm(serviceOptions[0] || ""));
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(null);

  const [touched, setTouched] = useState({
    date: false,
    vehicle: false,
    plate: false,
    carSize: false,
    service: false,
    time: false,
  });

  const [savedCarOpen, setSavedCarOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [carSizeOpen, setCarSizeOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [preferredDetailerOpen, setPreferredDetailerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const grid = useMemo(() => {
    const start = startOfMonth(month);
    const startDow = start.getDay();
    const dim = daysInMonth(month);

    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const dayNum = i - startDow + 1;
      if (dayNum < 1 || dayNum > dim) cells.push(null);
      else cells.push(new Date(month.getFullYear(), month.getMonth(), dayNum));
    }
    return cells;
  }, [month]);

  const selectedService = useMemo(
    () => bookableServices.find((item) => item.name === form.service),
    [bookableServices, form.service]
  );
  const isMotorCoating = isMotorCoatingService(selectedService || form.service);

  const timeOptions = useMemo(
    () => (selectedService ? getServiceArrivalTimeOptions(selectedService, form.time) : []),
    [selectedService, form.time]
  );
  const timeOptionLabels = useMemo(
    () => timeOptions.map((option) => option.label),
    [timeOptions]
  );
  const total = useMemo(
    () => getPriceForCarSize(selectedService, isMotorCoating ? "" : form.carSize),
    [selectedService, form.carSize, isMotorCoating]
  );
  const selectedSavedCar = useMemo(
    () => savedCars.find((car) => getSavedCarId(car) === form.selectedCar) || null,
    [form.selectedCar, savedCars]
  );
  const selectedPreferredDetailer = useMemo(
    () => preferredDetailers.find((detailer) => detailer.id === form.preferredDetailerId) || null,
    [form.preferredDetailerId, preferredDetailers]
  );
  const selectedDateAvailableSlots = useMemo(() => {
    if (!selectedDate) return null;

    const occupiedSlots = new Set(
      (Array.isArray(bookings) ? bookings : [])
        .filter((booking) => {
          const status = String(booking?.status || "").trim().toLowerCase();
          return toKey(new Date(booking?.date)) === toKey(selectedDate) && status !== "cancelled";
        })
        .map((booking) => Number(booking?.placeSlot || 0))
        .filter((slot) => PLACE_SLOT_OPTIONS.includes(slot))
    );

    return Math.max(0, PLACE_SLOT_OPTIONS.length - occupiedSlots.size);
  }, [bookings, selectedDate]);

  const errors = useMemo(() => {
    const next = {};
    if (!selectedDate) next.date = "Date is required. Please select a booking date.";
    else if (toKey(selectedDate) < todayKey) next.date = "Please choose today or a future date.";
    if (!String(form.vehicle || "").trim()) next.vehicle = "Vehicle model is required.";
    if (!String(form.plate || "").trim()) next.plate = "Plate number is required.";
    if (savedCars.length > 0 && !selectedSavedCar) {
      next.vehicle = "Select your saved vehicle before confirming this booking.";
    }
    if (!isMotorCoating && !String(form.carSize || "").trim()) {
      next.carSize = "Please select a car size.";
    }
    if (!String(form.service || "").trim()) next.service = "Please select a service.";
    if (!String(form.time || "").trim()) next.time = "Please select a time slot.";
    return next;
  }, [form, isMotorCoating, savedCars.length, selectedDate, selectedSavedCar, todayKey]);

  const canConfirm = Object.keys(errors).length === 0;
  const showErr = (key) => Boolean(touched[key] && errors[key]);

  const handleSavedCarPick = (option) => {
    const selectedCar = savedCars.find((car) => getSavedCarId(car) === option);
    setForm((prev) => ({
      ...prev,
      selectedCar: option,
      vehicle: selectedCar?.vehicle || prev.vehicle,
      plate: String(selectedCar?.plate || prev.plate).toUpperCase(),
      carSize: isMotorCoating ? "" : String(selectedCar?.size || prev.carSize || ""),
    }));
  };

  const confirm = async () => {
    if (submitting) return;

    setSubmitError("");

    setTouched({
      date: true,
      vehicle: true,
      plate: true,
      carSize: true,
      service: true,
      time: true,
    });

    if (!canConfirm) {
      Alert.alert("Incomplete booking", "Please complete the required booking details.");
      return;
    }

    setSubmitting(true);
    try {
      const createdBooking = await createBooking({
        customer: currentUser?.name || "Customer",
        customerEmail: String(currentUser?.email || "").trim(),
        date: toKey(selectedDate),
        time: form.time,
        vehicle: String(form.vehicle || "").trim().replace(/\s+/g, " "),
        selectedCar: form.selectedCar,
        carSize: isMotorCoating ? "Not Applicable" : String(form.carSize || "").trim(),
        plate: String(form.plate || "")
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9-]/g, ""),
        service: form.service,
        promoId: "",
        rewardId: "",
        originalAmount: Number(total || 0),
        assigned: "",
        customerRequested: true,
        bookingSource: "customer",
        amount: Number(total || 0),
        status: "Pending Confirmation",
        issueNote: String(form.notes || "").trim(),
        issueTypes: [],
        issueMarkers: [{ id: 1, x: 50, y: 50 }],
        ...buildPreferredDetailerPayload(form, preferredDetailers),
      }, { awaitRefresh: false });

      onConfirm?.({
        bookingId: String(
          createdBooking?.booking?.id ||
            createdBooking?.booking?._id ||
            createdBooking?.data?.booking?.id ||
            createdBooking?.data?.booking?._id ||
            createdBooking?.payment?.bookingId ||
            createdBooking?.data?.payment?.bookingId ||
            createdBooking?.id ||
            createdBooking?._id ||
            createdBooking?.bookingId ||
            ""
        ).trim(),
        paymentId: String(
          createdBooking?.payment?.id ||
            createdBooking?.payment?._id ||
            createdBooking?.data?.payment?.id ||
            createdBooking?.data?.payment?._id ||
            createdBooking?.paymentId ||
            createdBooking?.data?.paymentId ||
            ""
        ).trim(),
        payment:
          createdBooking?.payment ||
          createdBooking?.data?.payment ||
          createdBooking?.booking?.payment ||
          createdBooking?.data?.booking?.payment ||
          null,
        customerEmail: String(currentUser?.email || "").trim(),
        date: toKey(selectedDate),
        vehicle: String(form.vehicle || "").trim(),
        plate: String(form.plate || "").trim().toUpperCase(),
        carSize: isMotorCoating ? "Not Applicable" : String(form.carSize || "").trim(),
        service: form.service,
        time: form.time,
        amount: total,
      });
    } catch (error) {
      const fieldErrors = error?.errors && typeof error.errors === "object"
        ? Object.values(error.errors).filter(Boolean).join(" ")
        : "";
      const message = fieldErrors || error?.message || "Failed to create booking.";
      setSubmitError(message);
      Alert.alert("Booking failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.headRow}>
          <View style={styles.headLeft}>
            <Text style={styles.h1}>Book a Car Service</Text>
            <Text style={styles.h2}>Choose a saved car or enter a vehicle manually.</Text>
          </View>

          <TouchableOpacity activeOpacity={0.9} style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backTxt}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Client</Text>
          <View style={styles.readOnlyWrap}>
            <Text style={styles.readOnlyTxt}>{currentUser?.name || "Customer"}</Text>
            <Text style={styles.readOnlySubTxt}>{currentUser?.email || "No email available"}</Text>
          </View>

          {carOptions.length > 0 && (
            <>
              <Text style={styles.label}>Saved Car</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.selectWrap}
                onPress={() => setSavedCarOpen(true)}
              >
                <Text style={[styles.selectTxt, !form.selectedCar && styles.selectTxtPlaceholder]}>
                  {selectedSavedCar ? getSavedCarLabel(selectedSavedCar) : "Select saved car"}
                </Text>
                <Text style={styles.chev}>v</Text>
              </TouchableOpacity>
              <Text style={styles.helperTxt}>
                Selecting a saved car will autofill the vehicle, plate number, and car size.
              </Text>
            </>
          )}

          <Text style={styles.label}>Vehicle Model*</Text>
          <View style={[styles.inputWrap, showErr("vehicle") && styles.inputError]}>
            <TextInput
              value={form.vehicle}
              onChangeText={(value) =>
                setForm((prev) => ({ ...prev, selectedCar: "", vehicle: value }))
              }
              onBlur={() => setTouched((prev) => ({ ...prev, vehicle: true }))}
              placeholder="e.g., Toyota Vios / Honda Civic"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
            />
          </View>
          {showErr("vehicle") && <Text style={styles.errTxt}>{errors.vehicle}</Text>}

          <Text style={styles.label}>Plate Number*</Text>
          <View style={[styles.inputWrap, showErr("plate") && styles.inputError]}>
            <TextInput
              value={form.plate}
              onChangeText={(value) =>
                setForm((prev) => ({
                  ...prev,
                  selectedCar: "",
                  plate: String(value || "").toUpperCase(),
                }))
              }
              onBlur={() => setTouched((prev) => ({ ...prev, plate: true }))}
              placeholder="e.g., XYZ 1234"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              style={styles.input}
            />
          </View>
          {showErr("plate") && <Text style={styles.errTxt}>{errors.plate}</Text>}

          <Text style={styles.label}>{isMotorCoating ? "Car Size" : "Car Size*"}</Text>
          <TouchableOpacity
            disabled={isMotorCoating}
            activeOpacity={0.9}
            style={[
              styles.selectWrap,
              isMotorCoating && styles.selectWrapDisabled,
              showErr("carSize") && styles.inputError,
            ]}
            onPress={() => {
              if (isMotorCoating) return;
              setTouched((prev) => ({ ...prev, carSize: true }));
              setCarSizeOpen(true);
            }}
          >
            <Text
              style={[
                styles.selectTxt,
                (!form.carSize || isMotorCoating) && styles.selectTxtPlaceholder,
              ]}
            >
              {isMotorCoating ? "Not required for Motor Coating" : form.carSize || "Select car size"}
            </Text>
            {!isMotorCoating ? <Text style={styles.chev}>v</Text> : null}
          </TouchableOpacity>
          {showErr("carSize") && <Text style={styles.errTxt}>{errors.carSize}</Text>}

          <Text style={styles.label}>Service*</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.selectWrap, showErr("service") && styles.inputError]}
            onPress={() => {
              setTouched((prev) => ({ ...prev, service: true }));
              setServiceOpen(true);
            }}
          >
            <Text style={[styles.selectTxt, !form.service && styles.selectTxtPlaceholder]}>
              {form.service || "Select a service"}
            </Text>
            <Text style={styles.chev}>v</Text>
          </TouchableOpacity>
          {showErr("service") && <Text style={styles.errTxt}>{errors.service}</Text>}

          <Text style={styles.label}>Preferred Detailer</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.selectWrap}
            onPress={() => setPreferredDetailerOpen(true)}
          >
            <Text style={[styles.selectTxt, !selectedPreferredDetailer && styles.selectTxtPlaceholder]}>
              {selectedPreferredDetailer?.label || "No preference"}
            </Text>
            <Text style={styles.chev}>v</Text>
          </TouchableOpacity>
          <Text style={styles.helperTxt}>
            We will try to assign your preferred detailer when they are available.
          </Text>

          <Text style={styles.label}>Time Slot*</Text>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.selectWrap, showErr("time") && styles.inputError]}
            onPress={() => {
              setTouched((prev) => ({ ...prev, time: true }));
              if (selectedService) {
                setTimeOpen(true);
              }
            }}
          >
            <Text style={[styles.selectTxt, !form.time && styles.selectTxtPlaceholder]}>
              {form.time
                ? (timeOptions.find((option) => option.value === form.time)?.label || form.time)
                : (selectedService ? "Select time slot" : "Select a service first")}
            </Text>
            <Text style={styles.chev}>v</Text>
          </TouchableOpacity>
          {showErr("time") && <Text style={styles.errTxt}>{errors.time}</Text>}
          {!showErr("time") && (
            <Text style={styles.helperTxt}>
              {selectedService
                ? "Available time slots depend on the selected service."
                : "Choose a service first to see available time slots."}
            </Text>
          )}

          <Text style={styles.label}>Additional Notes</Text>
          <View style={styles.textAreaWrap}>
            <TextInput
              value={form.notes}
              onChangeText={(value) => setForm((prev) => ({ ...prev, notes: value }))}
              placeholder="Optional issue note or request"
              placeholderTextColor="#9CA3AF"
              style={styles.textArea}
              multiline
            />
          </View>
        </View>

        <Text style={styles.sectionHelp}>Choose your preferred booking date*</Text>

        <View style={[styles.calendarCard, showErr("date") && styles.cardWarn]}>
          <View style={styles.calTopRow}>
            <Text style={styles.calTitle}>{monthLabel(month)}</Text>

            <View style={styles.calNav}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.navBtn}
                onPress={() => setMonth((m) => addMonths(m, -1))}
              >
                <Text style={styles.navTxt}>{"<"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.navBtn}
                onPress={() => setMonth((m) => addMonths(m, 1))}
              >
                <Text style={styles.navTxt}>{">"}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.dowRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <Text key={day} style={styles.dowTxt}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {grid.map((cell, idx) => {
              if (!cell) return <View key={String(idx)} style={styles.dayCell} />;

              const cellKey = toKey(cell);
              const isPast = cellKey < todayKey;
              const active = isSameDay(cell, selectedDate);

              return (
                <TouchableOpacity
                  key={String(idx)}
                  activeOpacity={0.9}
                  disabled={isPast}
                  style={[
                    styles.dayCell,
                    styles.dayBtn,
                    active && styles.dayBtnActive,
                    isPast && styles.dayBtnDisabled,
                  ]}
                  onPress={() => {
                    setTouched((prev) => ({ ...prev, date: true }));
                    setSelectedDate(cell);
                  }}
                >
                  <Text
                    style={[
                      styles.dayNum,
                      active && styles.dayNumActive,
                      isPast && styles.dayNumDisabled,
                    ]}
                  >
                    {cell.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!selectedDate ? (
            <Text style={[styles.errTxt, { marginTop: 10 }]}>
              Date is required. Please select a booking date.
            </Text>
          ) : showErr("date") ? (
            <Text style={[styles.errTxt, { marginTop: 10 }]}>{errors.date}</Text>
          ) : (
            <View style={styles.selectedDateInfo}>
              <Text style={styles.selectedDateText}>Selected Date: {selectedDateLabel(selectedDate)}</Text>
              <Text style={styles.availableSlotsText}>
                {selectedDateAvailableSlots} of {PLACE_SLOT_OPTIONS.length} slots available
              </Text>
            </View>
          )}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Amount:</Text>
          <Text style={styles.totalValue}>{total ? `PHP ${total.toLocaleString()}` : "PHP -"}</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.92}
          style={[styles.confirmBtn, (!canConfirm || submitting) && styles.confirmBtnDisabled]}
          onPress={confirm}
          disabled={submitting}
        >
          <Text style={styles.confirmTxt}>{submitting ? "Creating booking..." : "Confirm Booking"}</Text>
        </TouchableOpacity>

        {submitError ? <Text style={[styles.errTxt, { marginTop: 10 }]}>{submitError}</Text> : null}

        <SelectModal
          visible={savedCarOpen}
          title="Select Saved Car"
          options={carOptions}
          value={form.selectedCar}
          onPick={handleSavedCarPick}
          onClose={() => setSavedCarOpen(false)}
        />

        <SelectModal
          visible={carSizeOpen}
          title="Select Car Size"
          options={CAR_SIZE_OPTIONS}
          value={form.carSize}
          onPick={(option) => setForm((prev) => ({ ...prev, carSize: option }))}
          onClose={() => setCarSizeOpen(false)}
        />

        <SelectModal
          visible={serviceOpen}
          title="Select a Service"
          options={serviceOptions}
          value={form.service}
          onPick={(option) =>
            setForm((prev) => ({
              ...prev,
              service: option,
              carSize: isMotorCoatingService(option) ? "" : prev.carSize,
              time: "",
            }))
          }
          onClose={() => setServiceOpen(false)}
        />

        <SelectModal
          visible={timeOpen}
          title="Select Time Slot"
          options={timeOptionLabels}
          value={timeOptions.find((option) => option.value === form.time)?.label || ""}
          onPick={(label) => {
            const selectedOption = timeOptions.find((option) => option.label === label);
            setForm((prev) => ({ ...prev, time: selectedOption?.value || prev.time }));
          }}
          onClose={() => setTimeOpen(false)}
        />
        <SelectModal
          visible={preferredDetailerOpen}
          title="Preferred Detailer"
          options={preferredDetailerOptions}
          value={form.preferredDetailerId}
          onPick={(preferredDetailerId) =>
            setForm((prev) => ({ ...prev, preferredDetailerId }))
          }
          onClose={() => setPreferredDetailerOpen(false)}
        />

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

import { useEffect, useState } from 'react';
import {
    collection,
    doc,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    type DocumentData,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Employee, AttendanceRecord, PayrollEntry } from '../lib/types';

// ================================
// Firestore Hooks
// Real-time data sync with Firebase
// ================================

// Convert Firestore timestamp to ISO string
function toISOString(timestamp: Timestamp | string | undefined): string {
    if (!timestamp) return new Date().toISOString();
    if (typeof timestamp === 'string') return timestamp;
    return timestamp.toDate().toISOString();
}

// Convert document to Employee
function docToEmployee(data: DocumentData, id: string): Employee {
    return {
        id,
        name: data.name || '',
        role: data.role || '',
        department: data.department || '',
        monthlyPay: data.monthlyPay || 0,
        joinDate: toISOString(data.joinDate),
        status: data.status || 'active',
        email: data.email,
        phone: data.phone,
        avatarUrl: data.avatarUrl,
        notes: data.notes,
        createdAt: toISOString(data.createdAt),
        updatedAt: toISOString(data.updatedAt),
    };
}

// Convert document to AttendanceRecord
function docToAttendance(data: DocumentData, id: string): AttendanceRecord {
    return {
        id,
        employeeId: data.employeeId || '',
        date: data.date || '',
        status: data.status || 'present',
        overtimeHours: data.overtimeHours || 0,
        notes: data.notes,
        createdAt: toISOString(data.createdAt),
        updatedAt: toISOString(data.updatedAt),
    };
}

// Convert document to PayrollEntry
function docToPayroll(data: DocumentData, id: string): PayrollEntry {
    return {
        id,
        employeeId: data.employeeId || '',
        month: data.month || '',
        daysWorked: data.daysWorked || 0,
        halfDays: data.halfDays || 0,
        overtimeHours: data.overtimeHours || 0,
        deductions: data.deductions || 0,
        basePay: data.basePay || 0,
        overtimePay: data.overtimePay || 0,
        netPay: data.netPay || 0,
        status: data.status || 'draft',
        generatedAt: toISOString(data.generatedAt),
        paidAt: data.paidAt ? toISOString(data.paidAt) : undefined,
    };
}

// ================================
// useEmployees Hook
// ================================
export function useEmployees() {
    const { user } = useAuth();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setEmployees([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, COLLECTIONS.EMPLOYEES),
            where('userId', '==', user.uid),
            orderBy('name')
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const data = snapshot.docs.map((doc) =>
                    docToEmployee(doc.data(), doc.id)
                );
                setEmployees(data);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Employees fetch error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [user]);

    const addEmployee = async (employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!user) throw new Error('Not authenticated');

        const now = Timestamp.now();
        const docRef = await addDoc(collection(db, COLLECTIONS.EMPLOYEES), {
            ...employee,
            userId: user.uid,
            joinDate: employee.joinDate,
            createdAt: now,
            updatedAt: now,
        });
        return docRef.id;
    };

    const updateEmployee = async (id: string, updates: Partial<Employee>) => {
        const docRef = doc(db, COLLECTIONS.EMPLOYEES, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: Timestamp.now(),
        });
    };

    const deleteEmployee = async (id: string) => {
        const docRef = doc(db, COLLECTIONS.EMPLOYEES, id);
        await deleteDoc(docRef);
    };

    return { employees, loading, error, addEmployee, updateEmployee, deleteEmployee };
}

// ================================
// useAttendance Hook
// ================================
export function useAttendance(month?: string) {
    const { user } = useAuth();
    const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setAttendance([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, COLLECTIONS.ATTENDANCE),
            where('userId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                let data = snapshot.docs.map((doc) =>
                    docToAttendance(doc.data(), doc.id)
                );

                // Filter by month client-side if needed
                if (month) {
                    data = data.filter((record) => record.date.startsWith(month));
                }

                setAttendance(data);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Attendance fetch error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [user, month]);

    const markAttendance = async (record: Omit<AttendanceRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
        if (!user) throw new Error('Not authenticated');

        const now = Timestamp.now();
        await addDoc(collection(db, COLLECTIONS.ATTENDANCE), {
            ...record,
            userId: user.uid,
            createdAt: now,
            updatedAt: now,
        });
    };

    const updateAttendance = async (id: string, updates: Partial<AttendanceRecord>) => {
        const docRef = doc(db, COLLECTIONS.ATTENDANCE, id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: Timestamp.now(),
        });
    };

    return { attendance, loading, error, markAttendance, updateAttendance };
}

// ================================
// usePayroll Hook
// ================================
export function usePayroll(month?: string) {
    const { user } = useAuth();
    const [payroll, setPayroll] = useState<PayrollEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setPayroll([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, COLLECTIONS.PAYROLL),
            where('userId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                let data = snapshot.docs.map((doc) =>
                    docToPayroll(doc.data(), doc.id)
                );

                // Filter by month client-side if needed
                if (month) {
                    data = data.filter((entry) => entry.month === month);
                }

                setPayroll(data);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Payroll fetch error:', err);
                setError(err.message);
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [user, month]);

    const createPayrollEntry = async (entry: Omit<PayrollEntry, 'id' | 'generatedAt'>) => {
        if (!user) throw new Error('Not authenticated');

        await addDoc(collection(db, COLLECTIONS.PAYROLL), {
            ...entry,
            userId: user.uid,
            generatedAt: Timestamp.now(),
        });
    };

    const updatePayrollEntry = async (id: string, updates: Partial<PayrollEntry>) => {
        const docRef = doc(db, COLLECTIONS.PAYROLL, id);
        await updateDoc(docRef, updates);
    };

    return { payroll, loading, error, createPayrollEntry, updatePayrollEntry };
}
